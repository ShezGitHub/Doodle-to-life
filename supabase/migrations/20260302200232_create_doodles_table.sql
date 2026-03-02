/*
  # Create doodles database schema

  1. New Tables
    - `doodles`
      - `id` (uuid, primary key) - Unique identifier for each doodle
      - `user_id` (uuid) - Reference to authenticated user
      - `image_data` (text) - Base64 encoded drawing image
      - `mime_type` (text) - Image MIME type (e.g., image/png)
      - `drawing_prompt` (text, nullable) - Optional description of the drawing
      - `parent_context` (text, nullable) - Additional context about the drawing
      - `video_url` (text, nullable) - URL to the generated video
      - `video_status` (text) - Status: 'pending', 'processing', 'completed', 'failed'
      - `is_safe` (boolean) - Whether content passed safety check
      - `safety_reason` (text, nullable) - Reason if flagged as unsafe
      - `created_at` (timestamptz) - When the doodle was created
      - `updated_at` (timestamptz) - When the doodle was last updated

  2. Security
    - Enable RLS on `doodles` table
    - Add policy for authenticated users to create their own doodles
    - Add policy for authenticated users to view their own doodles
    - Add policy for authenticated users to update their own doodles
    - Add policy for authenticated users to delete their own doodles

  3. Indexes
    - Index on user_id for faster queries
    - Index on created_at for sorting
*/

-- Create doodles table
CREATE TABLE IF NOT EXISTS doodles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  image_data text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  drawing_prompt text,
  parent_context text,
  video_url text,
  video_status text NOT NULL DEFAULT 'pending',
  is_safe boolean NOT NULL DEFAULT true,
  safety_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE doodles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create own doodles"
  ON doodles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own doodles"
  ON doodles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own doodles"
  ON doodles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own doodles"
  ON doodles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_doodles_user_id ON doodles(user_id);
CREATE INDEX IF NOT EXISTS idx_doodles_created_at ON doodles(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_doodles_updated_at
  BEFORE UPDATE ON doodles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();