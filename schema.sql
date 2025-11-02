-- Status Page Database Schema for PostgreSQL (Neon)
-- This schema supports monitoring multiple services with 30-day history

-- Table: services
-- Stores the list of websites/services to monitor
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    check_interval INTEGER DEFAULT 420, -- in seconds (default: 7 minutes)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure URLs are unique to avoid duplicates when reseeding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        WHERE r.relname = 'services' AND c.conname = 'services_url_unique'
    ) THEN
        ALTER TABLE services ADD CONSTRAINT services_url_unique UNIQUE (url);
    END IF;
END;
$$;

-- Table: status_checks
-- Stores historical status check results (used for 30-day history)
CREATE TABLE IF NOT EXISTS status_checks (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL, -- 'operational', 'degraded', 'down'
    response_time INTEGER, -- in milliseconds
    status_code INTEGER, -- HTTP status code
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Table: incidents
-- Stores downtime incidents for each service
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL, -- 'investigating', 'identified', 'monitoring', 'resolved'
    severity VARCHAR(20) NOT NULL, -- 'minor', 'major', 'critical'
    started_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_service_incident FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Table: incident_updates
-- Stores updates/messages for each incident
CREATE TABLE IF NOT EXISTS incident_updates (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_status_checks_service_id ON status_checks(service_id);
CREATE INDEX IF NOT EXISTS idx_status_checks_checked_at ON status_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_status_checks_service_checked ON status_checks(service_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_service_id ON incidents(service_id);
CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at);
CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_id ON incident_updates(incident_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-cleanup function to delete status_checks older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_status_checks()
RETURNS void AS $$
BEGIN
    DELETE FROM status_checks 
    WHERE checked_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Insert initial services
INSERT INTO services (name, url, description, check_interval) VALUES
    ('TCIOE Main Website', 'https://tcioe.edu.np', 'Main institutional website', 420),
    ('TCIOE Admissions Portal', 'https://admission.tcioe.edu.np', 'Student admissions portal', 420),
    ('Class Routine System', 'https://routine.tcioe.edu.np', 'Class schedule and routine system', 420),
    ('DOECE Website', 'https://doece.tcioe.edu.np', 'Department of Electronics and Computer Engineering', 420),
    ('ECAST', 'https://ecast.tcioe.edu.np', 'Electronics and Computer Community Amidst Students, Thapathali', 420),
    ('DOAS Website', 'https://doas.tcioe.edu.np', 'Department of Applied Sciences', 420),
    ('DOARCH Website', 'https://doarch.tcioe.edu.np', 'Department of Architecture', 420),
    ('DOCE Website', 'https://doce.tcioe.edu.np', 'Department of Civil Engineering', 420),
    ('DOIE Website', 'https://doie.tcioe.edu.np', 'Department of Industrial Engineering', 420),
    ('E-Library', 'https://elibrary.tcioe.edu.np', 'Digital library portal', 420),
    ('Journal Portal', 'https://journal.tcioe.edu.np', 'Academic journal portal', 420),
    ('Library System', 'https://library.tcioe.edu.np', 'Library management system', 420),
    ('Learning Management System', 'https://lms.tcioe.edu.np', 'LMS for online courses', 420),
    ('DOAME Website', 'https://doame.tcioe.edu.np', 'Department of Automobile and Mechanical Engineering', 420),
    ('Free Student Union (FSU)', 'https://fsu.tcioe.edu.np', 'The Free Student Union (FSU) of Thapathali Engineering Campus', 420),
    ('Robotics and Automation Center (RAC)', 'https://rac.tcioe.edu.np', 'Robotics and Automation center', 420),
    ('Nepal Terai Bidharthi Sangh (NTBS)', 'https://ntbs.tcioe.edu.np', 'Nepal Terai Bidharthi Sangh', 420),
    ('TENSOR', 'https://tensor.tcioe.edu.np', 'TENSOR', 420),
    ('Status Page', 'https://status.tcioe.edu.np', 'Status page for TCIOE services', 420)
ON CONFLICT DO NOTHING;

-- Announcement reason templates (pool)
CREATE TABLE IF NOT EXISTS announcement_reason_templates (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    label TEXT NOT NULL,
    weight INTEGER DEFAULT 1
);

INSERT INTO announcement_reason_templates (code, label, weight) VALUES
    ('POWER_OUTAGE', 'Power outage affecting our data center', 3),
    ('NETWORK_MAINTENANCE', 'Scheduled network maintenance in progress', 3),
    ('SERVER_MAINTENANCE', 'Server maintenance and updates', 3),
    ('HARDWARE_FAILURE', 'Hardware component failure - working on replacement', 3),
    ('ISP_ISSUE', 'Internet service provider connectivity issue', 2),
    ('CAMPUS_NETWORK', 'Campus network infrastructure disruption', 2),
    ('SERVER_OVERLOAD', 'High traffic causing server resource constraints', 2),
    ('DATABASE_ISSUE', 'Database connectivity or performance issue', 2),
    ('FIREWALL_CONFIG', 'Firewall or security configuration update', 2),
    ('DNS_PROPAGATION', 'DNS configuration changes propagating', 2),
    ('SSL_CERTIFICATE', 'SSL certificate renewal or update', 1),
    ('COOLING_SYSTEM', 'Data center cooling system maintenance', 1),
    ('BACKUP_RESTORE', 'System backup or restore operation', 2),
    ('SOFTWARE_UPDATE', 'Critical software patch deployment', 2),
    ('NETWORK_CONGESTION', 'Network bandwidth congestion', 1),
    ('POWER_FLUCTUATION', 'UPS/power system fluctuation', 2),
    ('ROUTER_CONFIG', 'Router or switch configuration update', 1),
    ('UNEXPECTED_REBOOT', 'Unexpected system reboot - investigating cause', 3)
ON CONFLICT (code) DO NOTHING;

-- Announcement reasons per incident (persisted until resolution)
CREATE TABLE IF NOT EXISTS announcement_reasons (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    reason_code VARCHAR(64) NOT NULL,
    reason_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (incident_id)
);

-- Comments
COMMENT ON TABLE services IS 'List of websites/services to monitor';
COMMENT ON TABLE status_checks IS 'Historical status check results for uptime tracking';
COMMENT ON TABLE incidents IS 'Downtime incidents and their resolution status';
COMMENT ON TABLE incident_updates IS 'Timeline updates for each incident';
COMMENT ON COLUMN status_checks.status IS 'operational, degraded, or down';
COMMENT ON COLUMN incidents.status IS 'investigating, identified, monitoring, or resolved';
COMMENT ON COLUMN incidents.severity IS 'minor, major, or critical';
