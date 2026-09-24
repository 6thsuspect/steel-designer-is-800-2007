/**
 * App shell — sidebar module tree (Group A–E per PRD §4), topbar workspace
 * actions (save/load/new/undo/redo), and the active module workspace.
 */
import React from 'react';
import {
  getState,
  setState,
  subscribe,
  undo,
  redo,
  canUndo,
  canRedo,
  ProjectState,
  MODULES,
  ModuleKey,
  defaultCase,
} from './state/store';
import { ModuleWorkspace, PlannedModule } from './modules/ModuleWorkspace';
import { DesignBasisModule, ProjectReportModule } from './modules/ProjectModules';
import { Card } from './components/ui';

function useStore(): ProjectState {
  const [state, set] = React.useState(getState());
  React.useEffect(() => subscribe(() => set(getState())), []);
  return state;
}

const GROUP_ORDER = [
  'A. Project & Design Setup',
  'B. Member Design',
  'C. Connection Design',
  'D. Component & System Design',
  'E. Specialized Analysis & Reporting',
];

const GROUP_TITLES: Record<string, string> = {
  'A. Project & Design Setup': 'A — Project & Design Setup',
  'B. Member Design': 'B — Member Design',
  'C. Connection Design': 'C — Connection Design',
  'D. Component & System Design': 'D — Component & System Design',
  'E. Specialized Analysis & Reporting': 'E — Specialized & Reporting',
};

export default function App() {
  const s = useStore();
  const [activeModule, setActiveModule] = React.useState<ModuleKey>('design-basis');
  const activeCase = s.cases.find((c) => c.id === s.selectedId) ?? null;

  const openModule = (moduleKey: ModuleKey) => {
    setActiveModule(moduleKey);
    const mod = MODULES.find((m) => m.key === moduleKey)!;
    const existing = s.cases.find((c) => c.module === moduleKey);
    if (mod.implemented && moduleKey !== 'design-basis' && moduleKey !== 'report') {
      if (existing) {
        setState((st) => ({ ...st, selectedId: existing.id, activeTab: 'input' }));
      } else {
        const cs = defaultCase(moduleKey, s.cases.filter((c) => c.module === moduleKey).length + 1);
        setState((st) => ({ ...st, cases: [...st.cases, cs], selectedId: cs.id, activeTab: 'input' }));
      }
    } else {
      setState((st) => ({ ...st, selectedId: null, activeTab: 'input' }));
    }
  };

  const newCase = (moduleKey: ModuleKey) => {
    const cs = defaultCase(moduleKey, s.cases.filter((c) => c.module === moduleKey).length + 1);
    setState((st) => ({ ...st, cases: [...st.cases, cs], selectedId: cs.id, activeTab: 'input' }));
  };

  return (
    <div className="h-screen flex flex-col bg-steel-100 text-steel-900 print:block">
      {/* Topbar */}
      <header className="h-12 bg-steel-800 text-white flex items-center px-4 gap-2 shrink-0 print:hidden">
        <span className="font-bold tracking-tight">
          Steel Designer <span className="text-amber-400">IS800</span>
        </span>
        <span className="text-[10px] text-steel-400 hidden lg:inline">IS 800:2007 · Limit State Design · v1.1.0</span>
        <div className="flex-1" />
        <input
          className="bg-steel-700 rounded px-2 py-1 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-amber-400"
          value={s.name}
          onChange={(e) => setState((st) => ({ ...st, name: e.target.value }))}
          title="Project name (FR-1.1)"
        />
        <TopBtn onClick={downloadWorkspace} title="Save project as JSON file (FR-1.12)">Save</TopBtn>
        <TopBtn onClick={uploadWorkspace} title="Open project JSON (FR-1.12)">Open</TopBtn>
        <TopBtn
          onClick={() => {
            if (confirm('Start a new project? Save current work first (workspace is also kept in local storage).')) {
              setState((st) => ({ ...st, cases: [], selectedId: null, name: 'Untitled Project' }));
            }
          }}
          title="New project"
        >
          New
        </TopBtn>
        <div className="w-px h-5 bg-steel-600" />
        <TopBtn onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">⟲</TopBtn>
        <TopBtn onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Y)">⟳</TopBtn>
      </header>

      <div className="flex flex-1 min-h-0 print:block">
        {/* Sidebar */}
        <nav className="w-64 bg-white border-r border-steel-200 overflow-y-auto p-2 shrink-0 print:hidden">
          {GROUP_ORDER.map((g) => (
            <div key={g} className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-steel-400 px-2 py-1">{GROUP_TITLES[g]}</p>
              {MODULES.filter((m) => m.group === g).map((m) => {
                const active = activeModule === m.key;
                const caseCount = s.cases.filter((c) => c.module === m.key).length;
                return (
                  <div key={m.key}>
                    <button
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-[13px] flex items-center justify-between gap-2 ${
                        active ? 'bg-steel-800 text-white' : 'hover:bg-steel-100 text-steel-800'
                      }`}
                      onClick={() => openModule(m.key)}
                    >
                      <span className="truncate">
                        <span className={`font-mono text-[10px] mr-1.5 ${active ? 'text-amber-400' : 'text-steel-400'}`}>{m.no}</span>
                        {m.title}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {!m.implemented && (
                          <span className={`text-[9px] px-1 py-0.5 rounded border ${active ? 'border-steel-600 text-steel-300' : 'bg-steel-100 text-steel-500 border-steel-200'}`}>
                            P{m.phase}
                          </span>
                        )}
                        {caseCount > 0 && (
                          <span className={`text-[9px] px-1 rounded-full ${active ? 'bg-amber-400 text-steel-900' : 'bg-steel-200'}`}>{caseCount}</span>
                        )}
                      </span>
                    </button>
                    {active && caseCount > 0 && (
                      <div className="ml-3 mt-1 space-y-0.5">
                        {s.cases
                          .filter((c) => c.module === m.key)
                          .map((c) => (
                            <div
                              key={c.id}
                              className={`flex items-center justify-between px-2 py-1 rounded text-[12px] cursor-pointer ${
                                c.id === s.selectedId ? 'bg-amber-100 text-steel-900' : 'hover:bg-steel-50 text-steel-600'
                              }`}
                              onClick={() => setState((st) => ({ ...st, selectedId: c.id }))}
                            >
                              <span className="truncate">{c.name}</span>
                              <button
                                className="text-steel-400 hover:text-red-600 ml-1"
                                title="Delete case"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete "${c.name}"?`))
                                    setState((st) => ({
                                      ...st,
                                      cases: st.cases.filter((x) => x.id !== c.id),
                                      selectedId: st.selectedId === c.id ? null : st.selectedId,
                                    }));
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        <button
                          className="w-full text-left px-2 py-1 rounded text-[12px] text-steel-500 hover:bg-steel-50"
                          onClick={() => newCase(m.key)}
                        >
                          + Add case
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <p className="text-[10px] text-steel-400 px-2 pt-2 border-t border-steel-100">
            P2–P4 markers show the PRD phase roadmap. Workspace auto-saved to this browser.
          </p>
        </nav>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-5 print:overflow-visible print:p-0">
          <ModuleBoundary key={activeModule}>
            {activeModule === 'design-basis' ? (
              <DesignBasisModule />
            ) : activeModule === 'report' ? (
              <ProjectReportModule />
            ) : !MODULES.find((m) => m.key === activeModule)?.implemented ? (
              <PlannedModule moduleKey={activeModule} />
            ) : activeCase && activeCase.module === activeModule ? (
              <ModuleWorkspace key={activeCase.id} cs={activeCase} />
            ) : (
              <EmptyModule onAdd={() => newCase(activeModule)} />
            )}
          </ModuleBoundary>
        </main>
      </div>
    </div>
  );
}

/** Keeps a single bad screen from unmounting the whole app (blank-page guard). */
class ModuleBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Module render error:', error);
  }
  componentDidUpdate(prevProps: { children: React.ReactNode }) {
    if (prevProps.children !== this.props.children && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-white rounded-xl border border-fail p-6 max-w-2xl">
          <h2 className="text-sm font-bold text-fail">This module failed to render</h2>
          <p className="text-[12px] text-steel-600 mt-2 font-mono">{String(this.state.error?.message ?? this.state.error)}</p>
          <p className="text-[11px] text-steel-500 mt-2">Select another module or report this message. Your data is safe.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function EmptyModule({ onAdd }: { onAdd: () => void }) {
  return (
    <Card title="No design case yet" subtitle="Create one to start this module">
      <button onClick={onAdd} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-steel-700 text-white hover:bg-steel-800">
        + Add case
      </button>
    </Card>
  );
}

function TopBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-2.5 py-1 text-xs rounded bg-steel-700 hover:bg-steel-600 disabled:opacity-30 disabled:hover:bg-steel-700"
    >
      {children}
    </button>
  );
}

function downloadWorkspace() {
  const st = getState();
  const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${st.name.replace(/[^\w\-. ]+/g, '') || 'workspace'}.steel.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function uploadWorkspace() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.onchange = async () => {
    const file = inp.files?.[0];
    if (!file) return;
    try {
      const st = JSON.parse(await file.text()) as ProjectState;
      setState(() => ({ ...st, activeTab: st.activeTab ?? 'input' }));
    } catch {
      alert('Could not read the workspace file.');
    }
  };
  inp.click();
}

/* Ctrl+S / Ctrl+Z / Ctrl+Y shortcuts */
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    downloadWorkspace();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
});
