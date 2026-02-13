import DailyReportsCard from "@/components/DailyReportsCard";
import CalendarCard from "@/components/CalendarCard";
import HabitCard from "@/components/HabitCard";
import MarketCard from "@/components/MarketCard";
import ProjectsCard from "@/components/ProjectsCard";
import JunoWidget from "@/components/JunoWidget";
import LiveClock from "@/components/LiveClock";
import MotivationalBanner from "@/components/MotivationalBanner";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#161b22]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff8c5a] flex items-center justify-center text-white font-bold text-xl shadow-lg animate-pulse-tangerine">
                J
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Juno Mission Control</h1>
                <p className="text-sm text-[#8b949e]">Your personal command center</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Juno Widget - Active Status */}
              <JunoWidget />
              
              {/* Live Clock - Updates every second */}
              <LiveClock />
            </div>
          </div>
        </div>
      </header>

      {/* Motivational Banner - Daily Quote */}
      <MotivationalBanner />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Daily Reports */}
          <DailyReportsCard />

          {/* Calendar */}
          <CalendarCard />

          {/* Habit Tracking */}
          <HabitCard />

          {/* Market Overview */}
          <MarketCard />

          {/* Active Projects */}
          <ProjectsCard />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#161b22] mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-[#8b949e]">
            Juno Mission Control © {new Date().getFullYear()} — Built with Next.js
          </p>
        </div>
      </footer>
    </div>
  );
}