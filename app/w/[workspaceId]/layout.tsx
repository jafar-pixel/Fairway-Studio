import type { ReactNode } from 'react'
import { FairwayStudio } from '@/components/studio/app'

// Keep workspace state mounted when the catch-all view segment changes.
// The client shell reads the current pathname and owns navigation guards.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <><FairwayStudio />{children}</>
}
