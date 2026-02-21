# SceneRead - Actor's Script Practice App

Master your lines with AI-powered scene partners, real-time feedback, and professional self-tape tools.

## Features

- 📜 **Script Import** - Paste text or upload scripts, AI parses them automatically
- 🎙️ **AI Scene Partners** - ElevenLabs voices read your scene partner's lines
- ⚡ **Real-time Feedback** - ElevenLabs Scribe v2 transcribes your speech with 150ms latency
- 🎬 **Self-Tape Studio** - Record professional self-tapes with script overlay
- 📊 **Analytics** - Track your progress, streaks, and improvement areas
- 🔄 **Practice Modes** - Full script, cue-only, or memory mode

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (Auth, Database, Storage)
- **AI Services**: 
  - ElevenLabs (Text-to-Speech + Speech-to-Text via Scribe v2 Realtime)
  - Anthropic Claude (Script Parsing)
- **Workflows**: n8n

## Setup

### 1. Clone and Install

```bash
cd sceneread-app
npm install
```

### 2. Configure Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xitppwzylrkpyemgqmpv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Get your anon key from: Supabase Dashboard → Settings → API → Project API keys → anon/public

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

## API Endpoints (n8n)

The app uses these n8n webhook endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/webhook/sceneread-import` | Import and parse scripts |
| `/webhook/sceneread-speech` | Generate AI voice audio |
| `/webhook/sceneread-transcribe` | Transcribe user speech |
| `/webhook/sceneread-accuracy` | Check line accuracy |

## Database Schema

- `profiles` - User profiles and stats
- `scripts` - Imported scripts
- `scenes` - Scenes within scripts
- `lines` - Individual dialogue lines
- `practice_sessions` - Practice session records
- `line_attempts` - Individual line attempt records
- `recordings` - Self-tape recordings
- `daily_stats` - Daily practice statistics
- `user_achievements` - Unlocked achievements

## License

MIT
