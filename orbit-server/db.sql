-- ════════════════════════════════════════════════════════
--  ORBIT — Supabase Schema
--  Pegar en: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════

-- Tabla de perfiles de usuario (complementa auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  name         TEXT DEFAULT 'World Explorer',
  language     TEXT DEFAULT 'en',
  -- Categorías favoritas (array: ['sports','technology','gaming',...])
  favorites    TEXT[] DEFAULT ARRAY['sports','technology','world'],
  -- Si quiere recibir el Daily Brief por email
  daily_brief  BOOLEAN DEFAULT true,
  -- Timezone para enviar el brief a las 20:00 hora local
  timezone     TEXT DEFAULT 'Europe/Madrid',
  -- Métricas
  articles_read    INTEGER DEFAULT 0,
  countries_visited TEXT[] DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen    TIMESTAMPTZ DEFAULT NOW()
);

-- Historial de artículos leídos (para personalización)
CREATE TABLE IF NOT EXISTS public.article_reads (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  article_id   TEXT NOT NULL,
  article_title TEXT,
  category     TEXT,
  country      TEXT,
  read_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Artículos guardados (favoritos del usuario)
CREATE TABLE IF NOT EXISTS public.saved_articles (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  article_id   TEXT NOT NULL,
  article_title TEXT,
  article_url  TEXT,
  category     TEXT,
  country      TEXT,
  source       TEXT,
  saved_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Métricas de engagement por artículo
CREATE TABLE IF NOT EXISTS public.article_engagement (
  article_id   TEXT PRIMARY KEY,
  likes        INTEGER DEFAULT 0,
  passes       INTEGER DEFAULT 0,
  reads        INTEGER DEFAULT 0,
  trend_score  FLOAT DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: cada usuario solo ve sus propios datos
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_reads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_articles  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Own reads" ON public.article_reads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Own saves" ON public.saved_articles
  FOR ALL USING (auth.uid() = user_id);

-- article_engagement es pública (read) pero solo el backend puede escribir
CREATE POLICY "Public engagement read" ON public.article_engagement
  FOR SELECT USING (true);

-- Función: crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: se ejecuta cuando alguien se registra
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_reads_user    ON public.article_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_reads_time    ON public.article_reads(read_at DESC);
CREATE INDEX IF NOT EXISTS idx_saves_user    ON public.saved_articles(user_id);
