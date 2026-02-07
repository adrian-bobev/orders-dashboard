-- Create app_settings table for storing application configuration
-- This is a key-value store for settings that can be managed via admin UI

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Add RLS policies
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read settings
CREATE POLICY "Authenticated users can read settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify settings (we'll check admin role in the app)
CREATE POLICY "Authenticated users can update settings"
  ON app_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default Speedy settings (empty, to be configured via admin UI)
INSERT INTO app_settings (key, value, description) VALUES
  ('speedy_client_id', 'null', 'Speedy API Client ID - select from profiles'),
  ('speedy_send_from', '"office"', 'Send from mode: "office" or "address"'),
  ('speedy_dropoff_office_id', 'null', 'Speedy dropoff office ID (only for office mode)'),
  ('speedy_dropoff_city_id', 'null', 'City ID for the dropoff office'),
  ('speedy_dropoff_city_name', '""', 'City name for display purposes'),
  ('speedy_sender_name', '""', 'Sender contact name'),
  ('speedy_sender_phone', '""', 'Sender phone number'),
  ('speedy_cod_as_ppp', 'false', 'Cash on delivery as PPP'),
  ('speedy_generate_label_auto', 'false', 'Auto-generate label after order')
ON CONFLICT (key) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_updated_at();
