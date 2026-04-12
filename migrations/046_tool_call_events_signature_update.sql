-- Allow updating only signature / signing_key_id on append-only tool_call_events.

DROP RULE IF EXISTS tool_call_events_no_update ON tool_call_events;

CREATE OR REPLACE FUNCTION tool_call_events_only_signing_may_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.event_id IS DISTINCT FROM NEW.event_id
     OR OLD.agent_id IS DISTINCT FROM NEW.agent_id
     OR OLD.session_id IS DISTINCT FROM NEW.session_id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.tool_id IS DISTINCT FROM NEW.tool_id
     OR OLD.tool_version IS DISTINCT FROM NEW.tool_version
     OR OLD.called_at IS DISTINCT FROM NEW.called_at
     OR OLD.inputs IS DISTINCT FROM NEW.inputs
     OR OLD.outputs IS DISTINCT FROM NEW.outputs
     OR OLD.context_trust_level IS DISTINCT FROM NEW.context_trust_level
     OR OLD.decision_made IS DISTINCT FROM NEW.decision_made
     OR OLD.human_review_required IS DISTINCT FROM NEW.human_review_required
     OR OLD.outcome_notes IS DISTINCT FROM NEW.outcome_notes
     OR OLD.legal_basis IS DISTINCT FROM NEW.legal_basis
     OR OLD.purpose IS DISTINCT FROM NEW.purpose
     OR OLD.eu_ai_act_risk_level IS DISTINCT FROM NEW.eu_ai_act_risk_level
     OR OLD.trace_id IS DISTINCT FROM NEW.trace_id
     OR OLD.parent_span_id IS DISTINCT FROM NEW.parent_span_id
     OR OLD.prev_event_hash IS DISTINCT FROM NEW.prev_event_hash
     OR OLD.event_hash IS DISTINCT FROM NEW.event_hash
     OR OLD.annotation_ref IS DISTINCT FROM NEW.annotation_ref
     OR OLD.oversight_record_ref IS DISTINCT FROM NEW.oversight_record_ref
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'tool_call_events row is immutable except signature and signing_key_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tool_call_events_signing_only ON tool_call_events;
CREATE TRIGGER tool_call_events_signing_only
  BEFORE UPDATE ON tool_call_events
  FOR EACH ROW EXECUTE FUNCTION tool_call_events_only_signing_may_change();
