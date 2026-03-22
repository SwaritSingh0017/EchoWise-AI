# 🌿 EchoWise AI: Circular Economy Ecosystem

EchoWise is a next-generation waste management and recycling platform that leverages **Artificial Intelligence** and **Web3** to incentivize environmental responsibility. We bridge the gap between concerned citizens, local waste collectors, and industrial recyclers.

![EchoWise Banner](https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=1470&auto=format&fit=crop)

---

## 🌐 Live Platform
Experience EchoWise AI live at: **[https://echowise-ai.onrender.com/](https://echowise-ai.onrender.com/)**

---

## 🚀 Key Features

### 1. AI-Powered Waste Reporting
- **Image Recognition**: Upload a photo of waste, and our Gemini 1.5 Flash AI automatically identifies the type (Plastic, Organic, Metal, etc.) and estimates the quantity.
- **Geolocation**: Reports are tagged with precise GPS coordinates for efficient collection.

### 2. Verified Collection Flow
- **Collector Network**: Users can browse nearby waste reports and "Start Collection".
- **Anti-Fraud Verification**: Collectors must provide a verification photo. The AI ensures the collected waste matches the original report and prevents image reuse (Hashing).
- **Self-Collection Lock**: To maintain integrity, users cannot collect reports they submitted themselves.

### 3. Incentivized Eco-System (Rewards)
- **Tokenized Rewards**: Earn points for every verified collection.
- **Redemption**: Convert points into rewards or use them within our sustainable brand partner network.
- **Leaderboards**: Compete with others to become the top waste-remover in your area.

### 4. Direct Communication
- **Contact Reporter**: Collectors can directly email waste reporters to coordinate difficult pickups.

---

## 🛠 Tech Stack

- **Frontend**: [Next.js 14](https://nextjs.org/) (App Router), [Tailwind CSS](https://tailwindcss.com/)
- **State & Logic**: [React](https://react.dev/), [Lucide Icons](https://lucide.dev/)
- **Database & ORM**: [Neon PostgreSQL](https://neon.tech/), [Drizzle ORM](https://orm.drizzle.team/)
- **AI Engine**: [Google Gemini 1.5 Flash](https://aistudio.google.com/)
- **Authentication**: [Web3Auth](https://web3auth.io/) (Social + Web3 Login)

---

## ⚙️ Environment Variables

Create a `.env.local` file in the root directory with the following keys:

```bash
# Google Services
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="your_google_maps_key"
NEXT_PUBLIC_GEMINI_API_KEY="your_gemini_api_key"

# Database
DATABASE_URL="your_neon_postgresql_url"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 🏗 Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd ECHO-WISE-UPDATES
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Database Setup**:
   ```bash
   npm run db:push
   ```

4. **Run Development Server**:
   ```bash
   npm run dev
   ```

The application will be available at [http://localhost:3000](http://localhost:3000).

---

## 📈 Business Case
EchoWise provides high-quality, AI-verified waste data for **ESG reporting**, **EPR compliance**, and **Circular Economy marketplaces**. It turns waste management from a cost center into a value-generating ecosystem.

---

## ⚖️ License
MIT License - Copyright (c) 2024 EchoWise Team
