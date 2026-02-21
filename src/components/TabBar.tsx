'use client'

import { useStore } from '@/store'
import { IconLibrary, IconPractice, IconRecord, IconProfile } from './icons'

// Home icon
const IconHome = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
)

const tabs = [
  { id: 'home' as const, label: 'Home', Icon: IconHome },
  { id: 'library' as const, label: 'Library', Icon: IconLibrary },
  { id: 'practice' as const, label: 'Practice', Icon: IconPractice },
  { id: 'record' as const, label: 'Studio', Icon: IconRecord },
  { id: 'profile' as const, label: 'Profile', Icon: IconProfile },
]

export function TabBar() {
  const { activeTab, setActiveTab } = useStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      <div className="bg-gradient-to-t from-bg via-bg to-transparent pt-6 pb-2 px-4">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {tabs.map(({ id, label, Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                data-tutorial={`tab-${id}`}
                className={`
                  flex flex-col items-center gap-1 px-3 py-2 transition-colors duration-200
                  ${isActive ? 'text-ai' : 'text-text-subtle hover:text-text-muted'}
                `}
              >
                <Icon size={22} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
