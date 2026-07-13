-- ==============================================================================
-- 🔐 SYSTEM BLUEPRINT: PROFILE & RIGHTS MANAGEMENT MIGRATION
-- ==============================================================================

-- 1. ENUM für Rollen erstellen
CREATE TYPE user_role AS ENUM ('developer', 'admin', 'agent');

-- 2. Tabelle für Benutzerprofile erstellen
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  role user_role DEFAULT 'agent'::user_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Row Level Security (RLS) aktivieren
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 4. Policies erstellen

-- Jeder authentifizierte Nutzer kann alle Profile SEHEN (für Dropdowns etc.)
CREATE POLICY "Profile sind für alle authentifizierten Nutzer sichtbar"
ON user_profiles FOR SELECT
USING (auth.role() = 'authenticated');

-- Ein Nutzer kann sein eigenes Profil erstellen
CREATE POLICY "Nutzer können ihr eigenes Profil erstellen"
ON user_profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Ein Nutzer kann sein eigenes Profil (z.B. den Namen) aktualisieren
-- Administratoren und Developer können ALLES aktualisieren (auch Rollen)
CREATE POLICY "Profile können vom Eigentümer, Admin oder Dev aktualisiert werden"
ON user_profiles FOR UPDATE
USING (
  auth.uid() = id OR 
  (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'developer')
);

-- 5. Trigger für updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- 6. Trigger: Automatisches Anlegen eines Profils nach Signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, role)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), 
    'agent'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
