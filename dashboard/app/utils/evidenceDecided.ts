/**
 * Human oversight "decided" matching for Transfer — Review ↔ compliance / seal IDs.
 * Backend /api/v1/human_oversight/decided-evidence-ids returns evidence_event_id from compliance_records;
 * the map must also match seal_id, review_id, nexus_seal, and causation from HUMAN_OVERSIGHT_* events.
 */

export function addIdsToSet(set: Set<string>, ...ids: (string | undefined | null)[]) {
  for (const id of ids) {
    if (id == null || typeof id !== 'string') continue;
    const t = id.trim();
    if (!t) continue;
    set.add(t);
    set.add(t.toLowerCase());
  }
}

/** Merge API decided IDs + causation/seal links from oversight events + decided review-queue rows. */
export function buildDecidedEvidenceSet(
  apiEvidenceIds: string[],
  events: any[],
  reviewQueueAll: any[],
): Set<string> {
  const set = new Set<string>();
  addIdsToSet(set, ...apiEvidenceIds);

  for (const e of events) {
    const et = (e.eventType || '').toUpperCase();
    if (et !== 'HUMAN_OVERSIGHT_REJECTED' && et !== 'HUMAN_OVERSIGHT_APPROVED') continue;
    addIdsToSet(
      set,
      e.causationId,
      e.causation_id,
      e.payload?.causation_id,
      e.payload?.causationId,
      e.correlationId,
      e.correlation_id,
      e.payload?.seal_id,
      e.payload?.sealId,
      e.payload?.review_id,
      e.payload?.reviewId,
    );
  }

  for (const item of reviewQueueAll) {
    if ((item.status || '').toUpperCase() !== 'DECIDED') continue;
    addIdsToSet(
      set,
      item.evidenceId,
      item.context?.event_id,
      item.context?.evidence_id,
      item.sealId,
      item.id,
    );
  }

  return set;
}

/**
 * True if this evidence row is covered by a human decision (reject/approve),
 * so it should not count as pending SCC review on the map.
 */
export function evidenceEventIsDecided(event: any, decided: Set<string>): boolean {
  const candidates = [
    event.id,
    event.eventId,
    event.event_id,
    event.payload?.seal_id,
    event.payload?.sealId,
    event.payload?.review_id,
    event.payload?.reviewId,
    event.nexusSeal,
    event.nexus_seal,
    event.correlationId,
    event.correlation_id,
    event.causationId,
    event.causation_id,
  ];

  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (!s) continue;
    if (decided.has(s) || decided.has(s.toLowerCase())) return true;
  }
  return false;
}
