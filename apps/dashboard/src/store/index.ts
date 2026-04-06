/**
 * Global State Store using Zustand
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TimeRange {
  label: string;
  value: string;
  startTime: () => string;
  endTime: () => string;
}

export const timeRanges: TimeRange[] = [
  {
    label: 'Last 15 minutes',
    value: '15m',
    startTime: () => new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    endTime: () => new Date().toISOString(),
  },
  {
    label: 'Last hour',
    value: '1h',
    startTime: () => new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    endTime: () => new Date().toISOString(),
  },
  {
    label: 'Last 6 hours',
    value: '6h',
    startTime: () => new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    endTime: () => new Date().toISOString(),
  },
  {
    label: 'Last 24 hours',
    value: '24h',
    startTime: () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    endTime: () => new Date().toISOString(),
  },
  {
    label: 'Last 7 days',
    value: '7d',
    startTime: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endTime: () => new Date().toISOString(),
  },
  {
    label: 'Last 30 days',
    value: '30d',
    startTime: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endTime: () => new Date().toISOString(),
  },
];

interface AppState {
  // Time range
  selectedTimeRange: string;
  setTimeRange: (range: string) => void;
  getTimeRange: () => { startTime: string; endTime: string };

  // Filters
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;

  selectedStatus: string | null;
  setSelectedStatus: (status: string | null) => void;

  // UI
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Real-time
  realtimeEnabled: boolean;
  setRealtimeEnabled: (enabled: boolean) => void;

  // Refresh
  autoRefreshInterval: number;
  setAutoRefreshInterval: (interval: number) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Time range
      selectedTimeRange: '24h',
      setTimeRange: (range) => set({ selectedTimeRange: range }),
      getTimeRange: () => {
        const range = timeRanges.find((r) => r.value === get().selectedTimeRange);
        if (!range) {
          return {
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            endTime: new Date().toISOString(),
          };
        }
        return { startTime: range.startTime(), endTime: range.endTime() };
      },

      // Filters
      selectedAgentId: null,
      setSelectedAgentId: (id) => set({ selectedAgentId: id }),

      selectedStatus: null,
      setSelectedStatus: (status) => set({ selectedStatus: status }),

      // UI
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Theme
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // Real-time
      realtimeEnabled: true,
      setRealtimeEnabled: (enabled) => set({ realtimeEnabled: enabled }),

      // Refresh
      autoRefreshInterval: 30000, // 30 seconds
      setAutoRefreshInterval: (interval) => set({ autoRefreshInterval: interval }),
    }),
    {
      name: 'agentlens-store',
      partialize: (state) => ({
        selectedTimeRange: state.selectedTimeRange,
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        realtimeEnabled: state.realtimeEnabled,
        autoRefreshInterval: state.autoRefreshInterval,
      }),
    }
  )
);

// Selectors
export const useTimeRange = () => {
  const selectedTimeRange = useStore((s) => s.selectedTimeRange);
  const setTimeRange = useStore((s) => s.setTimeRange);
  const getTimeRange = useStore((s) => s.getTimeRange);
  return { selectedTimeRange, setTimeRange, getTimeRange };
};

export const useFilters = () => {
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const setSelectedAgentId = useStore((s) => s.setSelectedAgentId);
  const selectedStatus = useStore((s) => s.selectedStatus);
  const setSelectedStatus = useStore((s) => s.setSelectedStatus);
  return { selectedAgentId, setSelectedAgentId, selectedStatus, setSelectedStatus };
};
