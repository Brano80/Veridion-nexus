-- Migration 039: ACM DataTransferRecord table
-- Implements: ACM Spec v0.1 DataTransferRecord type
-- Regulatory mapping: GDPR Chapter V (cross-border transfers, Art. 44–49)

CREATE TABLE IF NOT EXISTS data_transfer_records (
    transfer_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            VARCHAR(64) NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    event_ref           UUID        REFERENCES tool_call_events(event_id) ON DELETE SET NULL,
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

    origin_country      VARCHAR(2)  NOT NULL,
    destination_country VARCHAR(2)  NOT NULL,

    transfer_mechanism  VARCHAR(20) NOT NULL
        CHECK (transfer_mechanism IN ('adequacy', 'scc', 'bcr', 'dpf', 'derogation', 'blocked')),

    data_categories     JSONB       NOT NULL DEFAULT '[]',

    dpf_relied_upon     BOOLEAN     NOT NULL DEFAULT false,
    schrems_iii_risk    BOOLEAN     NOT NULL DEFAULT false,

    scc_ref             TEXT,
    bcr_ref             TEXT,
    derogation_basis    TEXT,

    backup_mechanism    VARCHAR(20)
        CHECK (backup_mechanism IS NULL OR backup_mechanism IN ('scc', 'bcr', 'derogation')),

    transfer_timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_transfer_records_agent_id
    ON data_transfer_records(agent_id);

CREATE INDEX IF NOT EXISTS idx_data_transfer_records_tenant_id
    ON data_transfer_records(tenant_id);

CREATE INDEX IF NOT EXISTS idx_data_transfer_records_event_ref
    ON data_transfer_records(event_ref)
    WHERE event_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_transfer_records_destination
    ON data_transfer_records(destination_country);

CREATE INDEX IF NOT EXISTS idx_data_transfer_records_mechanism
    ON data_transfer_records(transfer_mechanism);

CREATE INDEX IF NOT EXISTS idx_data_transfer_records_schrems_iii
    ON data_transfer_records(schrems_iii_risk)
    WHERE schrems_iii_risk = true;

CREATE TABLE IF NOT EXISTS eea_countries (
    country_code    VARCHAR(2)  PRIMARY KEY,
    country_name    TEXT        NOT NULL,
    is_eu_member    BOOLEAN     NOT NULL DEFAULT true,
    adequacy_status TEXT
);

INSERT INTO eea_countries (country_code, country_name, is_eu_member, adequacy_status) VALUES
('AT', 'Austria',              true,  'eea_member'),
('BE', 'Belgium',              true,  'eea_member'),
('BG', 'Bulgaria',             true,  'eea_member'),
('CY', 'Cyprus',               true,  'eea_member'),
('CZ', 'Czech Republic',       true,  'eea_member'),
('DE', 'Germany',              true,  'eea_member'),
('DK', 'Denmark',              true,  'eea_member'),
('EE', 'Estonia',              true,  'eea_member'),
('ES', 'Spain',                true,  'eea_member'),
('FI', 'Finland',              true,  'eea_member'),
('FR', 'France',               true,  'eea_member'),
('GR', 'Greece',               true,  'eea_member'),
('HR', 'Croatia',              true,  'eea_member'),
('HU', 'Hungary',              true,  'eea_member'),
('IE', 'Ireland',              true,  'eea_member'),
('IT', 'Italy',                true,  'eea_member'),
('LT', 'Lithuania',            true,  'eea_member'),
('LU', 'Luxembourg',           true,  'eea_member'),
('LV', 'Latvia',               true,  'eea_member'),
('MT', 'Malta',                true,  'eea_member'),
('NL', 'Netherlands',          true,  'eea_member'),
('PL', 'Poland',               true,  'eea_member'),
('PT', 'Portugal',             true,  'eea_member'),
('RO', 'Romania',              true,  'eea_member'),
('SE', 'Sweden',               true,  'eea_member'),
('SI', 'Slovenia',             true,  'eea_member'),
('SK', 'Slovakia',             true,  'eea_member'),
('NO', 'Norway',               false, 'eea_member'),
('IS', 'Iceland',              false, 'eea_member'),
('LI', 'Liechtenstein',        false, 'eea_member')
ON CONFLICT (country_code) DO NOTHING;

CREATE OR REPLACE VIEW acm_data_transfer_records AS
SELECT
    transfer_id,
    agent_id,
    event_ref,
    tenant_id,
    origin_country,
    destination_country,
    transfer_mechanism,
    data_categories,
    dpf_relied_upon,
    schrems_iii_risk,
    scc_ref,
    bcr_ref,
    derogation_basis,
    backup_mechanism,
    transfer_timestamp,
    created_at
FROM data_transfer_records;
