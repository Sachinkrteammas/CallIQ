-- Settings tables migration for CallIQ
-- Run this against the call_audit database

CREATE TABLE IF NOT EXISTS workspace_settings (
  id INT PRIMARY KEY DEFAULT 1,
  workspace_name VARCHAR(255) DEFAULT 'Acme BPO',
  timezone VARCHAR(100) DEFAULT 'Asia/Kolkata (GMT+5:30)',
  default_language VARCHAR(50) DEFAULT 'English',
  date_format VARCHAR(50) DEFAULT 'DD MMM YYYY',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings_integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(100) NOT NULL,
  icon VARCHAR(50) DEFAULT 'Link',
  status VARCHAR(20) DEFAULT 'Disconnected',
  config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trigger_name VARCHAR(255) NOT NULL,
  channels JSON,
  frequency VARCHAR(100),
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings_security (
  id INT PRIMARY KEY DEFAULT 1,
  two_factor_auth BOOLEAN DEFAULT TRUE,
  session_timeout BOOLEAN DEFAULT TRUE,
  ip_whitelisting BOOLEAN DEFAULT FALSE,
  audit_logging BOOLEAN DEFAULT TRUE,
  data_encryption BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed workspace_settings (single row)
INSERT IGNORE INTO workspace_settings (id, workspace_name, timezone, default_language, date_format)
VALUES (1, 'Acme BPO', 'Asia/Kolkata (GMT+5:30)', 'English', 'DD MMM YYYY');

-- Seed settings_security (single row)
INSERT IGNORE INTO settings_security (id, two_factor_auth, session_timeout, ip_whitelisting, audit_logging, data_encryption)
VALUES (1, TRUE, TRUE, FALSE, TRUE, TRUE);

-- Seed settings_integrations
INSERT IGNORE INTO settings_integrations (name, type, icon, status) VALUES
('Twilio', 'Telephony', 'Phone', 'Connected'),
('Slack', 'Notifications', 'MessageSquare', 'Connected'),
('Salesforce', 'CRM', 'Database', 'Connected'),
('Zendesk', 'Ticketing', 'Ticket', 'Disconnected'),
('AWS S3', 'Storage', 'Cloud', 'Connected'),
('Google Workspace', 'Email', 'Mail', 'Connected');

-- Seed settings_notifications
INSERT IGNORE INTO settings_notifications (trigger_name, channels, frequency, enabled) VALUES
('Critical Incident Detected', '["Email","Slack","SMS"]', 'Immediate', TRUE),
('Agent Score Drops Below 60', '["Email","Slack"]', 'Immediate', TRUE),
('Compliance Violation', '["Email"]', 'Immediate', TRUE),
('Daily Summary Report', '["Email"]', 'Daily 6 PM', TRUE),
('Weekly Executive Report', '["Email"]', 'Monday 8 AM', TRUE),
('Escalation Threshold Breach', '["Email","Slack","SMS"]', 'Immediate', FALSE);
