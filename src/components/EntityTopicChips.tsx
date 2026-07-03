import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tags, Plus, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { apiFetch, apiPost, apiDelete } from '../utils/apiFetch';

interface EntityTopic {
  membership_id: string;
  topic_id: string;
  name: string;
  color: string | null;
  source: 'manual' | 'imported' | 'ai_suggested' | 'ai_accepted';
  confidence: number;
}

interface TopicOption { id: string; name: string }

/**
 * Topic memberships for any entity, shown wherever the entity lives — not just
 * in the Topics tab. Add is a manual (authoritative) membership; removing an
 * AI membership rejects it so generation won't resurface it.
 */
export function EntityTopicChips({ entityType, entityId, dark = false }: {
  entityType: string;
  entityId: string;
  dark?: boolean;
}) {
  const qc = useQueryClient();
  const { triggerToast } = useAppStore();
  const [adding, setAdding] = useState(false);

  const { data: memberships = [], refetch } = useQuery<EntityTopic[]>({
    queryKey: ['entity-topics', entityType, entityId],
    queryFn: () => apiFetch<EntityTopic[]>(`/api/topics/of/${entityType}/${entityId}`),
  });
  const { data: allTopics = [] } = useQuery<TopicOption[]>({
    queryKey: ['topics'],
    queryFn: () => apiFetch<TopicOption[]>('/api/topics'),
    enabled: adding,
  });

  const add = useMutation({
    mutationFn: (topicId: string) =>
      apiPost(`/api/topics/${topicId}/members`, { entity_type: entityType, entity_id: entityId }),
    onSuccess: () => {
      setAdding(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['topics'] });
      triggerToast('Added to topic (manual — authoritative).', 'success');
    },
    onError: (e: Error) => triggerToast(e.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (m: EntityTopic) => apiDelete(`/api/topics/${m.topic_id}/members/${m.membership_id}`),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ['topics'] });
    },
    onError: (e: Error) => triggerToast(e.message, 'error'),
  });

  const memberTopicIds = new Set(memberships.map(m => m.topic_id));
  const addable = allTopics.filter(t => !memberTopicIds.has(t.id));

  const chipBase = dark
    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
    : 'bg-[#EEF2FF] text-[#4648d4] border-[#c0c1ff]/50';
  const aiChip = dark
    ? 'bg-gray-800 text-gray-400 border-gray-700'
    : 'bg-gray-100 text-gray-500 border-gray-200';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tags size={11} className={dark ? 'text-gray-500' : 'text-gray-400'} />
      {memberships.length === 0 && !adding && (
        <span className={`text-[10px] font-mono ${dark ? 'text-gray-600' : 'text-gray-300'}`}>no topics</span>
      )}
      {memberships.map(m => (
        <span
          key={m.membership_id}
          className={`group inline-flex items-center gap-1 text-[10px] font-mono border px-1.5 py-0.5 rounded-full ${m.source === 'manual' ? chipBase : aiChip}`}
          title={m.source === 'manual' ? 'Manual membership — authoritative' : `AI membership (accepted, conf ${(m.confidence * 100).toFixed(0)}%)`}
        >
          {m.source !== 'manual' && '✦ '}{m.name}
          <button
            onClick={() => remove.mutate(m)}
            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
            title={m.source === 'manual' ? 'Remove membership' : 'Remove (rejects — will not be re-suggested)'}
          >
            <X size={9} />
          </button>
        </span>
      ))}
      {adding ? (
        <select
          autoFocus
          className={`text-[10px] font-mono border rounded-full px-1.5 py-0.5 outline-none ${dark ? 'bg-gray-900 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}
          onChange={e => e.target.value && add.mutate(e.target.value)}
          onBlur={() => setAdding(false)}
          defaultValue=""
        >
          <option value="" disabled>pick a topic…</option>
          {addable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          {addable.length === 0 && <option value="" disabled>no other topics — create one in Topics tab</option>}
        </select>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center ${dark ? 'border-gray-700 text-gray-500 hover:text-gray-300' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
          title="Add to a topic (manual membership)"
        >
          <Plus size={9} />
        </button>
      )}
    </div>
  );
}
