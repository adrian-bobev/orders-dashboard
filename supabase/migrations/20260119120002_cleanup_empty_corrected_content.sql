-- Clean up any existing records with empty corrected_content objects
UPDATE generation_corrected_content
SET corrected_content = NULL
WHERE corrected_content = '{}'::jsonb;
