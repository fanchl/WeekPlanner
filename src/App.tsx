import React, { useState, useEffect, useMemo } from 'react';
import './styles.css';

/**
 * WeekPlanner React + TypeScript Edition
 * 适配 CodeSandbox 的单文件实现 (App.tsx)
 */

// --- Types ---
interface Todo {
  id: string;
  text: string;
  done: boolean;
  status: TodoStatus;
  scheduledDay: Day;
  completedDay: Day | null;
  subtasks: Subtask[];
}

interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
}

interface WeeklyTodos {
  [weekKey: string]: {
    [projectId: string]: {
      [day: string]: Todo[];
    };
  };
}

interface AppData {
  projects: Project[];
  todos: WeeklyTodos;
  relations: TodoRelation[];
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
type Day = typeof DAYS[number];
type TodoStatus = 'active' | 'pending';
type ThemeMode = 'dark' | 'light';
type RelationType = 'followup' | 'split' | 'depends_on';
type MonthViewColumn = { key: string; label: string; offset: number; todoDay?: Day };
const MONTH_VIEW_COLUMNS: readonly MonthViewColumn[] = [
  { key: 'mon', label: 'MON', offset: 0, todoDay: 'mon' as Day },
  { key: 'tue', label: 'TUE', offset: 1, todoDay: 'tue' as Day },
  { key: 'wed', label: 'WED', offset: 2, todoDay: 'wed' as Day },
  { key: 'thu', label: 'THU', offset: 3, todoDay: 'thu' as Day },
  { key: 'fri', label: 'FRI', offset: 4, todoDay: 'fri' as Day },
  { key: 'sat', label: 'SAT', offset: 5 },
  { key: 'sun', label: 'SUN', offset: 6 }
] as const;

interface TodoRelation {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
  createdAt: string;
}

interface DragPayload {
  tid: string;
  fromPid: string;
  fromWeekKey: string;
  fromDay: Day;
}

interface CellTodoView {
  todo: Todo;
  sourceWeekKey: string;
  sourceDay: Day;
  displayDay: Day;
  isOverdueCarry: boolean;
}

interface TodoContextMenuState {
  x: number;
  y: number;
  pid: string;
  sourceWeekKey: string;
  sourceDay: Day;
  displayDay: Day;
  todoId: string;
}

interface PendingParentLinkState {
  childId: string;
  childText: string;
}

interface SubtaskDraftState {
  pid: string;
  sourceWeekKey: string;
  sourceDay: Day;
  todoId: string;
  subtaskId?: string;
}

interface ProjectContextMenuState {
  x: number;
  y: number;
  projectId: string;
}

interface ProjectDragState {
  projectId: string;
  position: 'before' | 'after';
}

interface DesktopBridge {
  isDesktop: boolean;
  openMarkdownFile: () => Promise<{ filePath: string; name: string; content: string } | null>;
  writeMarkdownFile: (filePath: string, content: string) => Promise<{ ok: boolean }>;
  saveMarkdownAs: (defaultName: string, content: string) => Promise<{ filePath: string; name: string } | null>;
  onQuickAdd: (callback: (payload: { text: string }) => void) => () => void;
}

const isDay = (value: unknown): value is Day =>
  typeof value === 'string' && (DAYS as readonly string[]).includes(value);

const DAY_INDEX: Record<Day, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4
};
const isTodoStatus = (value: unknown): value is TodoStatus => value === 'active' || value === 'pending';

const normalizeSubtask = (raw: any): Subtask => ({
  id: typeof raw?.id === 'string' ? raw.id : Math.random().toString(36).substr(2, 9),
  text: typeof raw?.text === 'string' ? raw.text : '',
  done: Boolean(raw?.done)
});

const syncTodoCompletionFromSubtasks = (todo: Todo, completedDay?: Day | null) => {
  if (!Array.isArray(todo.subtasks) || todo.subtasks.length === 0) return todo;
  if (todo.status === 'pending') {
    todo.done = false;
    todo.completedDay = null;
    return todo;
  }

  const allDone = todo.subtasks.every((subtask) => subtask.done);
  todo.done = allDone;
  todo.completedDay = allDone ? completedDay ?? todo.completedDay ?? todo.scheduledDay : null;
  return todo;
};

const getSubtaskProgress = (todo: Todo) => {
  const total = Array.isArray(todo.subtasks) ? todo.subtasks.length : 0;
  const completed = total > 0 ? todo.subtasks.filter((subtask) => subtask.done).length : 0;
  return { total, completed };
};

const normalizeTodo = (raw: any, fallbackDay: Day): Todo => ({
  ...syncTodoCompletionFromSubtasks({
    id: typeof raw?.id === 'string' ? raw.id : Math.random().toString(36).substr(2, 9),
    text: typeof raw?.text === 'string' ? raw.text : '',
    done: Boolean(raw?.done),
    status: isTodoStatus(raw?.status) ? raw.status : 'active',
    scheduledDay: isDay(raw?.scheduledDay) ? raw.scheduledDay : fallbackDay,
    completedDay: isDay(raw?.completedDay) ? raw.completedDay : (raw?.done ? fallbackDay : null),
    subtasks: Array.isArray(raw?.subtasks) ? raw.subtasks.map((subtask: any) => normalizeSubtask(subtask)) : []
  }, isDay(raw?.completedDay) ? raw.completedDay : (raw?.done ? fallbackDay : null))
});

const parseMetaParts = (rawMeta?: string) => {
  const meta: Record<string, string> = {};
  if (!rawMeta) return meta;

  rawMeta.split(';').forEach((part) => {
    const [rawKey, ...rawValueParts] = part.split(':');
    if (!rawKey || rawValueParts.length === 0) return;
    meta[rawKey.trim()] = rawValueParts.join(':').trim();
  });

  return meta;
};

const parseProjectMeta = (rawMeta?: string) => {
  const parsed = parseMetaParts(rawMeta);
  return {
    id: parsed.id,
    archived: parsed.archived === 'true'
  };
};

const parseInlineMeta = (rawMeta?: string) => {
  const meta: { id?: string; completedDay?: Day | null; status?: TodoStatus } = {};
  if (!rawMeta) return meta;

  const parsed = parseMetaParts(rawMeta);
  Object.entries(parsed).forEach(([key, value]) => {
    if (key === 'id' && value) {
      meta.id = value;
    }
    if (key === 'completed' && isDay(value)) {
      meta.completedDay = value;
    }
    if (key === 'status' && isTodoStatus(value)) {
      meta.status = value;
    }
  });

  return meta;
};

const parseSubtaskMeta = (rawMeta?: string) => {
  const parsed = parseMetaParts(rawMeta);
  return {
    id: parsed.id
  };
};

const getDesktopBridge = (): DesktopBridge | null => {
  const maybeBridge = (window as any).desktopBridge;
  return maybeBridge?.isDesktop ? maybeBridge as DesktopBridge : null;
};

const isImeComposing = (event: React.KeyboardEvent<HTMLInputElement>) => {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229;
};

const getProjectDayKey = (projectId: string, day: Day) => `${projectId}:${day}`;

const normalizeAppData = (raw: any): AppData => {
  const projects = Array.isArray(raw?.projects)
    ? raw.projects
        .filter((project: any) => project && typeof project.id === 'string')
        .map((project: any) => ({
          id: project.id,
          name: typeof project.name === 'string' ? project.name : '',
          color: typeof project.color === 'string' ? project.color : '#6c63ff',
          archived: Boolean(project.archived)
        }))
    : [];
  const todos = raw?.todos && typeof raw.todos === 'object' ? raw.todos : {};
  const relations = Array.isArray(raw?.relations)
    ? raw.relations.filter(
        (r: any) => r && typeof r.fromId === 'string' && typeof r.toId === 'string' && typeof r.type === 'string'
      )
    : [];

  const normalizedTodos: WeeklyTodos = {};
  Object.keys(todos).forEach((weekKey) => {
    normalizedTodos[weekKey] = {};
    Object.keys(todos[weekKey] || {}).forEach((projectId) => {
      normalizedTodos[weekKey][projectId] = { mon: [], tue: [], wed: [], thu: [], fri: [] };
      DAYS.forEach((day) => {
        const list = Array.isArray(todos[weekKey]?.[projectId]?.[day]) ? todos[weekKey][projectId][day] : [];
        normalizedTodos[weekKey][projectId][day] = list.map((todo: any) => normalizeTodo(todo, day));
      });
    });
  });

  return { projects, todos: normalizedTodos, relations };
};

// --- Utilities ---
const WeekUtil = {
  getMonday(d: Date) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  },
  formatDate(d: Date) {
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`;
  },
  formatDateKey(d: Date) {
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  },
  getMondayFromWeekKey(weekKey: string) {
    const [yearText, weekText] = weekKey.split('-W');
    const year = parseInt(yearText, 10);
    const week = parseInt(weekText, 10);
    const jan4 = new Date(year, 0, 4);
    const firstMonday = this.getMonday(jan4);
    firstMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
    return firstMonday;
  },
  getWeekKey(d: Date) {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const jan4 = new Date(target.getFullYear(), 0, 4);
    const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
    const weekNr = 1 + Math.ceil(dayDiff / 7);
    return `${target.getFullYear()}-W${weekNr.toString().padStart(2, '0')}`;
  },
  compareWeekKeys(a: string, b: string) {
    return this.getMondayFromWeekKey(a).getTime() - this.getMondayFromWeekKey(b).getTime();
  },
  shiftWeekKey(weekKey: string, offset: number) {
    const monday = this.getMondayFromWeekKey(weekKey);
    monday.setDate(monday.getDate() + offset * 7);
    return this.getWeekKey(monday);
  },
  getDateForWeekAndDay(weekKey: string, day: Day) {
    const date = this.getMondayFromWeekKey(weekKey);
    date.setDate(date.getDate() + DAY_INDEX[day]);
    return date;
  }
};

const getCurrentTodoDay = (): Day => {
  const day = new Date().getDay();
  if (day === 0 || day === 6) return 'fri';
  return DAYS[Math.max(0, day - 1)];
};

const THEME_STORAGE_KEY = 'weekplanner_theme';

const FileFormat = {
  serializeMarkdown(data: AppData) {
    let md = '# WeekPlanner Data\n';
    md += `> Last Updated: ${new Date().toLocaleString()}\n\n`;
    md += '## Projects\n';
    data.projects.forEach(p => {
      const metaParts = [`id: ${p.id}`];
      if (p.archived) {
        metaParts.push('archived: true');
      }
      md += `- [${p.name}](#${p.color.replace('#', '')}) <!-- ${metaParts.join('; ')} -->\n`;
    });
    md += '\n';

    const weeks = Object.keys(data.todos).sort();
    weeks.forEach(week => {
      const [year, weekNum] = week.split('-W');
      const monday = WeekUtil.getMonday(new Date(parseInt(year), 0, 1 + (parseInt(weekNum) - 1) * 7));
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      const range = `${WeekUtil.formatDate(monday)} - ${WeekUtil.formatDate(friday)}`;

      md += `## Week ${week} (${range})\n\n`;
      Object.keys(data.todos[week]).forEach(pid => {
        const project = data.projects.find(p => p.id === pid);
        md += `### ${project ? project.name : 'Unknown Project'} <!-- id: ${pid} -->\n`;
        DAYS.forEach(day => {
          (data.todos[week][pid][day] || []).forEach(task => {
            const metaParts = [`id: ${task.id}`];
            if (task.completedDay) {
              metaParts.push(`completed: ${task.completedDay}`);
            }
            if (task.status === 'pending') {
              metaParts.push(`status: pending`);
            }
            md += `- [${day}] [${task.done ? 'x' : ' '}] ${task.text} <!-- ${metaParts.join('; ')} -->\n`;
            (task.subtasks || []).forEach((subtask) => {
              md += `  - [${subtask.done ? 'x' : ' '}] ${subtask.text} <!-- id: ${subtask.id} -->\n`;
            });
          });
        });
        md += '\n';
      });
    });

    md += '## Relations\n';
    data.relations.forEach(r => {
      md += `- [${r.type}] ${r.fromId} -> ${r.toId} <!-- id: ${r.id} -->\n`;
    });
    md += '\n';
    return md;
  },

  parseMarkdown(text: string): AppData {
    const result: AppData = { projects: [], todos: {}, relations: [] };
    const lines = text.split('\n');
    let currentWeek: string | null = null;
    let currentProject: string | null = null;
    let currentTodo: Todo | null = null;
    let section: 'projects' | 'todos' | 'relations' | null = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) {
        currentTodo = null;
        return;
      }

      if (trimmed.startsWith('# Projects') || trimmed.startsWith('## Projects')) {
        section = 'projects';
        currentTodo = null;
        return;
      }
      if (trimmed.startsWith('## Relations')) {
        section = 'relations';
        currentTodo = null;
        return;
      }
      const weekMatch = trimmed.match(/^## Week (\d{4}-W\d+)/);
      if (weekMatch) {
        section = 'todos'; currentWeek = weekMatch[1];
        if (!result.todos[currentWeek]) result.todos[currentWeek] = {};
        currentTodo = null;
        return;
      }
      const projectHeaderMatch = trimmed.match(/^### (.+?) <!-- id: (.+?) -->/);
      if (projectHeaderMatch) {
        currentProject = projectHeaderMatch[2];
        if (currentWeek && !result.todos[currentWeek][currentProject]) {
          result.todos[currentWeek][currentProject] = { mon: [], tue: [], wed: [], thu: [], fri: [] };
        }
        currentTodo = null;
        return;
      }
      if (section === 'projects' && trimmed.startsWith('- [')) {
        const pMatch = trimmed.match(/- \[(.+?)\]\(#(.+?)\) <!-- (.+?) -->/);
        if (pMatch) {
          const meta = parseProjectMeta(pMatch[3]);
          result.projects.push({
            name: pMatch[1],
            color: '#' + pMatch[2],
            id: meta.id || Math.random().toString(36).substr(2, 9),
            archived: meta.archived
          });
        }
        currentTodo = null;
        return;
      }
      if (section === 'todos' && currentWeek && currentProject) {
        const subtaskMatch = line.match(/^\s{2,}- \[( |x)\] (.+?)(?: <!-- (.+?) -->)?$/);
        if (subtaskMatch && currentTodo) {
          const meta = parseSubtaskMeta(subtaskMatch[3]);
          currentTodo.subtasks.push({
            id: meta.id || Math.random().toString(36).substr(2, 9),
            text: subtaskMatch[2].trim(),
            done: subtaskMatch[1] === 'x'
          });
          syncTodoCompletionFromSubtasks(currentTodo, currentTodo.completedDay ?? currentTodo.scheduledDay);
          return;
        }
      }
      if (section === 'todos' && currentWeek && currentProject && !line.startsWith(' ') && trimmed.startsWith('- [')) {
        const tMatch = trimmed.match(/- \[(mon|tue|wed|thu|fri)\] \[( |x)\] (.+?)(?: <!-- (.+?) -->)?$/);
        if (tMatch) {
          const day = tMatch[1] as Day;
          const done = tMatch[2] === 'x';
          const text = tMatch[3].trim();
          const meta = parseInlineMeta(tMatch[4]);
          const todo = normalizeTodo({
            id: meta.id || Math.random().toString(36).substr(2, 9),
            text,
            done,
            status: meta.status ?? 'active',
            scheduledDay: day,
            completedDay: meta.completedDay ?? (done ? day : null),
            subtasks: []
          }, day);
          result.todos[currentWeek!][currentProject!][day].push(todo);
          currentTodo = todo;
        }
        return;
      }
      if (section === 'relations' && trimmed.startsWith('- [')) {
        const rMatch = trimmed.match(/- \[(followup|split|depends_on)\] (.+?) -> (.+?)(?: <!-- id: (.+?) -->)?$/);
        if (rMatch) {
          result.relations.push({
            id: rMatch[4] || Math.random().toString(36).substr(2, 9),
            type: rMatch[1] as RelationType,
            fromId: rMatch[2],
            toId: rMatch[3],
            createdAt: new Date().toISOString()
          });
        }
      }
      currentTodo = null;
    });
    return result;
  }
};

const hasAppDataContent = (data: AppData) =>
  data.projects.length > 0 || Object.keys(data.todos).length > 0 || data.relations.length > 0;

// --- Main App ---
export default function App() {
  const [appData, setAppData] = useState<AppData>(() => {
    const saved = localStorage.getItem('weekplanner_react_data');
    if (!saved) return { projects: [], todos: {}, relations: [] };
    try {
      return normalizeAppData(JSON.parse(saved));
    } catch {
      return { projects: [], todos: {}, relations: [] };
    }
  });
  const [currentMonday, setCurrentMonday] = useState(() => WeekUtil.getMonday(new Date()));
  const [viewMode, setViewMode] = useState<'board' | 'lineage' | 'month'>('board');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  const [selectedLineageTodoId, setSelectedLineageTodoId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  // Inline adding/editing state
  const [addingTaskCell, setAddingTaskCell] = useState<{ pid: string, day: Day, parentTodoId?: string } | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [tempTaskText, setTempTaskText] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState<SubtaskDraftState | null>(null);
  const [tempSubtaskText, setTempSubtaskText] = useState('');
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<DragPayload | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ pid: string, day: Day } | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [dragOverProject, setDragOverProject] = useState<ProjectDragState | null>(null);
  const [todoContextMenu, setTodoContextMenu] = useState<TodoContextMenuState | null>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(null);
  const [pendingParentLink, setPendingParentLink] = useState<PendingParentLinkState | null>(null);

  // Project Modal state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'rename'>('create');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#6c63ff');

  // File Handle for AutoSync
  const [fileHandle, setFileHandle] = useState<any>(null);

  // Click timer to distinguish single vs double click
  const clickTimeoutRef = React.useRef<any>(null);
  const syncDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEdgeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEdgeDirectionRef = React.useRef<-1 | 0 | 1>(0);
  const dragWeekSwitchAtRef = React.useRef(0);

  useEffect(() => {
    localStorage.setItem('weekplanner_react_data', JSON.stringify(appData));

    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    syncDebounceRef.current = setTimeout(() => {
      void (async () => {
        if (fileHandle) {
          await syncToFile(appData);
        }
      })();
    }, 250);
  }, [appData, fileHandle]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!todoContextMenu && !projectContextMenu) return;

    const closeMenu = () => {
      setTodoContextMenu(null);
      setProjectContextMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTodoContextMenu(null);
        setProjectContextMenu(null);
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [todoContextMenu, projectContextMenu]);

  useEffect(() => {
    if (!pendingParentLink) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingParentLink(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [pendingParentLink]);

  useEffect(() => {
    const clearDragEdgeTimer = () => {
      if (dragEdgeTimerRef.current) {
        clearTimeout(dragEdgeTimerRef.current);
        dragEdgeTimerRef.current = null;
      }
    };

    if (!draggingFrom) {
      clearDragEdgeTimer();
      dragEdgeDirectionRef.current = 0;
      return;
    }

    const EDGE_THRESHOLD = 72;
    const EDGE_HOLD_MS = 260;
    const SWITCH_COOLDOWN_MS = 420;

    const handleWindowDragOver = (event: DragEvent) => {
      let direction: -1 | 0 | 1 = 0;
      if (event.clientX <= EDGE_THRESHOLD) {
        direction = -1;
      } else if (event.clientX >= window.innerWidth - EDGE_THRESHOLD) {
        direction = 1;
      }

      if (direction === 0) {
        dragEdgeDirectionRef.current = 0;
        clearDragEdgeTimer();
        return;
      }

      if (dragEdgeDirectionRef.current === direction && dragEdgeTimerRef.current) {
        return;
      }

      dragEdgeDirectionRef.current = direction;
      clearDragEdgeTimer();

      const now = Date.now();
      const remainingCooldown = Math.max(0, SWITCH_COOLDOWN_MS - (now - dragWeekSwitchAtRef.current));
      const delay = Math.max(EDGE_HOLD_MS, remainingCooldown);

      dragEdgeTimerRef.current = setTimeout(() => {
        dragWeekSwitchAtRef.current = Date.now();
        dragEdgeDirectionRef.current = 0;
        dragEdgeTimerRef.current = null;
        setDragOverCell(null);
        setCurrentMonday((prev) => {
          const next = new Date(prev);
          next.setDate(next.getDate() + direction * 7);
          return next;
        });
      }, delay);
    };

    const handleWindowDragStop = () => {
      clearDragEdgeTimer();
      dragEdgeDirectionRef.current = 0;
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDragStop);
    window.addEventListener('dragend', handleWindowDragStop);

    return () => {
      clearDragEdgeTimer();
      dragEdgeDirectionRef.current = 0;
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDragStop);
      window.removeEventListener('dragend', handleWindowDragStop);
    };
  }, [draggingFrom]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const quickAddTodoToInbox = React.useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const inboxName = '📥Inbox';
    const targetMonday = WeekUtil.getMonday(new Date());
    const targetWeekKey = WeekUtil.getWeekKey(targetMonday);
    const targetDay = getCurrentTodoDay();

    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      let inboxProject = next.projects.find((project: Project) => project.name === inboxName);

      if (!inboxProject) {
        inboxProject = {
          id: Math.random().toString(36).substr(2, 9),
          name: inboxName,
          color: '#60a5fa',
          archived: false
        };
        next.projects.unshift(inboxProject);
      } else if (inboxProject.archived) {
        inboxProject.archived = false;
      }

      if (!next.todos[targetWeekKey]) next.todos[targetWeekKey] = {};
      if (!next.todos[targetWeekKey][inboxProject.id]) {
        next.todos[targetWeekKey][inboxProject.id] = { mon: [], tue: [], wed: [], thu: [], fri: [] };
      }

      next.todos[targetWeekKey][inboxProject.id][targetDay].push({
        id: Math.random().toString(36).substr(2, 9),
        text: trimmed,
        done: false,
        status: 'active',
        scheduledDay: targetDay,
        completedDay: null,
        subtasks: []
      });

      return next;
    });

    setCurrentMonday(targetMonday);
    setViewMode('board');
    showToast(`已添加到 ${inboxName}`);
  }, []);

  useEffect(() => {
    const desktopBridge = getDesktopBridge();
    if (!desktopBridge?.onQuickAdd) return;

    return desktopBridge.onQuickAdd((payload) => {
      if (typeof payload?.text === 'string') {
        quickAddTodoToInbox(payload.text);
      }
    });
  }, [quickAddTodoToInbox]);

  const weekKey = WeekUtil.getWeekKey(currentMonday);
  const daysInWeek = DAYS.map((_, i) => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const currentMonthDate = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), 1);
  const currentWeekMonday = WeekUtil.getMonday(new Date());
  const currentWeekDelta = Math.round(
    (currentMonday.getTime() - currentWeekMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const todayDayIndex = (() => {
    const today = new Date().getDay();
    if (today === 0 || today === 6) return 4;
    return today - 1;
  })();
  const overdueCutoffIndex = currentWeekDelta < 0 ? 4 : currentWeekDelta > 0 ? -1 : todayDayIndex;

  const projectNameById = useMemo(() => {
    const map: Record<string, string> = {};
    appData.projects.forEach((p: Project) => {
      map[p.id] = p.name;
    });
    return map;
  }, [appData.projects]);
  const visibleProjects = useMemo(
    () => appData.projects.filter((project: Project) => !project.archived),
    [appData.projects]
  );
  const archivedProjects = useMemo(
    () => appData.projects.filter((project: Project) => project.archived),
    [appData.projects]
  );
  const visibleProjectIds = useMemo(() => new Set(visibleProjects.map((project: Project) => project.id)), [visibleProjects]);

  const todoMetaById = useMemo(() => {
    const map = new Map<string, { todo: Todo, projectId: string, projectName: string, weekKey: string, day: Day }>();
    Object.keys(appData.todos).forEach((wk) => {
      Object.keys(appData.todos[wk]).forEach((pid) => {
        if (!visibleProjectIds.has(pid)) return;
        DAYS.forEach((day: Day) => {
          const list = appData.todos[wk][pid][day] || [];
          list.forEach((todo: Todo) => {
            map.set(todo.id, {
              todo,
              projectId: pid,
              projectName: projectNameById[pid] || 'Unknown Project',
              weekKey: wk,
              day
            });
          });
        });
      });
    });
    return map;
  }, [appData.todos, projectNameById, visibleProjectIds]);

  const weekTodoIds = useMemo(() => {
    const ids = new Set<string>();
    const weekTodos = appData.todos[weekKey] || {};
    Object.keys(weekTodos).forEach((pid) => {
      if (!visibleProjectIds.has(pid)) return;
      DAYS.forEach((day: Day) => {
        (weekTodos[pid][day] || []).forEach((todo: Todo) => ids.add(todo.id));
      });
    });
    return ids;
  }, [appData.todos, visibleProjectIds, weekKey]);
  const priorWeekKeys = useMemo(
    () =>
      Object.keys(appData.todos)
        .filter((candidateWeekKey) => WeekUtil.compareWeekKeys(candidateWeekKey, weekKey) < 0)
        .sort((a, b) => WeekUtil.compareWeekKeys(a, b)),
    [appData.todos, weekKey]
  );

  const lineageGraph = useMemo(() => {
    const edges = (appData.relations || []).filter((r: TodoRelation) => todoMetaById.has(r.fromId) && todoMetaById.has(r.toId));
    if (edges.length === 0) {
      return { nodeIds: [] as string[], edges: [] as TodoRelation[], positions: new Map<string, { x: number, y: number }>(), width: 640, height: 360 };
    }

    const included = new Set<string>(weekTodoIds);
    if (included.size === 0) {
      edges.forEach((r: TodoRelation) => {
        included.add(r.fromId);
        included.add(r.toId);
      });
    }

    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach((r: TodoRelation) => {
        if (included.has(r.fromId) || included.has(r.toId)) {
          if (!included.has(r.fromId)) {
            included.add(r.fromId);
            changed = true;
          }
          if (!included.has(r.toId)) {
            included.add(r.toId);
            changed = true;
          }
        }
      });
    }

    const filteredEdges = edges.filter((r: TodoRelation) => included.has(r.fromId) && included.has(r.toId));
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, number>();
    included.forEach((id) => {
      outgoing.set(id, []);
      incoming.set(id, 0);
    });
    filteredEdges.forEach((r: TodoRelation) => {
      outgoing.get(r.fromId)?.push(r.toId);
      incoming.set(r.toId, (incoming.get(r.toId) || 0) + 1);
    });

    const depth = new Map<string, number>();
    const queue: string[] = [];
    included.forEach((id) => {
      if ((incoming.get(id) || 0) === 0) {
        queue.push(id);
        depth.set(id, 0);
      }
    });

    if (queue.length === 0 && included.size > 0) {
      const first = Array.from(included)[0];
      queue.push(first);
      depth.set(first, 0);
    }

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const d = depth.get(current) || 0;
      (outgoing.get(current) || []).forEach((next) => {
        depth.set(next, Math.max(depth.get(next) || 0, d + 1));
        incoming.set(next, (incoming.get(next) || 0) - 1);
        if ((incoming.get(next) || 0) <= 0) {
          queue.push(next);
        }
      });
    }

    included.forEach((id) => {
      if (!depth.has(id)) depth.set(id, 0);
    });

    const columns = new Map<number, string[]>();
    included.forEach((id) => {
      const d = depth.get(id) || 0;
      if (!columns.has(d)) columns.set(d, []);
      columns.get(d)?.push(id);
    });

    columns.forEach((ids) => {
      ids.sort((a, b) => {
        const aTodo = todoMetaById.get(a)?.todo;
        const bTodo = todoMetaById.get(b)?.todo;
        if (!aTodo || !bTodo) return 0;
        return aTodo.text.localeCompare(bTodo.text);
      });
    });

    const positions = new Map<string, { x: number, y: number }>();
    const depths = Array.from(columns.keys()).sort((a, b) => a - b);
    let maxRows = 1;
    depths.forEach((d) => {
      const ids = columns.get(d) || [];
      maxRows = Math.max(maxRows, ids.length);
      ids.forEach((id, idx) => {
        positions.set(id, {
          x: 140 + d * 280,
          y: 90 + idx * 130
        });
      });
    });

    return {
      nodeIds: Array.from(included),
      edges: filteredEdges,
      positions,
      width: Math.max(640, depths.length * 280 + 220),
      height: Math.max(360, maxRows * 130 + 160)
    };
  }, [appData.relations, todoMetaById, weekTodoIds]);

  useEffect(() => {
    if (selectedLineageTodoId && !lineageGraph.nodeIds.includes(selectedLineageTodoId)) {
      setSelectedLineageTodoId(null);
    }
  }, [selectedLineageTodoId, lineageGraph.nodeIds]);

  const lineageFocus = useMemo(() => {
    if (!selectedLineageTodoId) {
      return {
        hasSelection: false,
        activeNodeIds: new Set<string>(),
        activeEdgeIds: new Set<string>()
      };
    }

    const allNodes = new Set(lineageGraph.nodeIds);
    if (!allNodes.has(selectedLineageTodoId)) {
      return {
        hasSelection: false,
        activeNodeIds: new Set<string>(),
        activeEdgeIds: new Set<string>()
      };
    }

    const outgoing = new Map<string, TodoRelation[]>();
    const incoming = new Map<string, TodoRelation[]>();
    lineageGraph.nodeIds.forEach((id) => {
      outgoing.set(id, []);
      incoming.set(id, []);
    });
    lineageGraph.edges.forEach((edge) => {
      outgoing.get(edge.fromId)?.push(edge);
      incoming.get(edge.toId)?.push(edge);
    });

    const activeNodeIds = new Set<string>([selectedLineageTodoId]);
    const activeEdgeIds = new Set<string>();

    const forwardQueue: string[] = [selectedLineageTodoId];
    const seenForward = new Set<string>([selectedLineageTodoId]);
    while (forwardQueue.length > 0) {
      const current = forwardQueue.shift() as string;
      (outgoing.get(current) || []).forEach((edge) => {
        activeEdgeIds.add(edge.id);
        if (!seenForward.has(edge.toId)) {
          seenForward.add(edge.toId);
          activeNodeIds.add(edge.toId);
          forwardQueue.push(edge.toId);
        }
      });
    }

    const backwardQueue: string[] = [selectedLineageTodoId];
    const seenBackward = new Set<string>([selectedLineageTodoId]);
    while (backwardQueue.length > 0) {
      const current = backwardQueue.shift() as string;
      (incoming.get(current) || []).forEach((edge) => {
        activeEdgeIds.add(edge.id);
        if (!seenBackward.has(edge.fromId)) {
          seenBackward.add(edge.fromId);
          activeNodeIds.add(edge.fromId);
          backwardQueue.push(edge.fromId);
        }
      });
    }

    return {
      hasSelection: true,
      activeNodeIds,
      activeEdgeIds
    };
  }, [selectedLineageTodoId, lineageGraph]);

  const monthView = useMemo(() => {
    const monthStart = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), 1);
    const monthEnd = new Date(currentMonday.getFullYear(), currentMonday.getMonth() + 1, 0);
    const calendarStart = WeekUtil.getMonday(monthStart);
    const calendarEnd = new Date(monthEnd);
    const monthEndDay = calendarEnd.getDay();
    const daysToSunday = monthEndDay === 0 ? 0 : 7 - monthEndDay;
    calendarEnd.setDate(calendarEnd.getDate() + daysToSunday);
    calendarEnd.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentViewWeekKey = WeekUtil.getWeekKey(currentMonday);

    const weeks = [];
    for (let cursor = new Date(calendarStart); cursor.getTime() <= calendarEnd.getTime(); cursor.setDate(cursor.getDate() + 7)) {
      const monday = new Date(cursor);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const targetWeekKey = WeekUtil.getWeekKey(monday);

      const days = MONTH_VIEW_COLUMNS.map((column) => {
        const date = new Date(monday);
        date.setDate(date.getDate() + column.offset);
        const items: Array<{ id: string; text: string; status: TodoStatus; done: boolean; projectName: string }> = [];
        const todoDay = column.todoDay;
        if (todoDay) {
          Object.keys(appData.todos[targetWeekKey] || {}).forEach((pid) => {
            if (!visibleProjectIds.has(pid)) return;
            (appData.todos[targetWeekKey][pid][todoDay] || []).forEach((todo) => {
              items.push({
                id: todo.id,
                text: todo.text,
                status: todo.status,
                done: todo.done,
                projectName: projectNameById[pid] || 'Unknown Project'
              });
            });
          });
        }
        return {
          key: column.key,
          label: column.label,
          date,
          items,
          isCurrentMonth: date.getMonth() === monthStart.getMonth(),
          isCurrentWeek: targetWeekKey === currentViewWeekKey,
          isToday: date.getTime() === today.getTime(),
          weekKey: targetWeekKey
        };
      });

      const activeCount = days.reduce(
        (sum, entry) => sum + entry.items.filter((item) => item.status === 'active' && !item.done).length,
        0
      );
      const pendingCount = days.reduce(
        (sum, entry) => sum + entry.items.filter((item) => item.status === 'pending').length,
        0
      );
      const doneCount = days.reduce((sum, entry) => sum + entry.items.filter((item) => item.done).length, 0);

      weeks.push({
        weekKey: targetWeekKey,
        label: `${WeekUtil.formatDate(monday)} - ${WeekUtil.formatDate(sunday)}`,
        isCurrentWeek: targetWeekKey === currentViewWeekKey,
        includesToday: days.some((entry) => entry.date.getTime() === today.getTime()),
        days,
        activeCount,
        pendingCount,
        doneCount
      });
    }

    return {
      label: `${monthStart.getFullYear()}年${monthStart.getMonth() + 1}月`,
      weeks
    };
  }, [appData.todos, currentMonday, projectNameById, visibleProjectIds]);

  const visibleTasksByCell = useMemo(() => {
    const map = new Map<string, CellTodoView[]>();
    const sourceWeekKeys = [...priorWeekKeys, weekKey];

    visibleProjects.forEach((project: Project) => {
      DAYS.forEach((displayDay: Day) => {
        const visibleTasks: CellTodoView[] = [];
        sourceWeekKeys.forEach((sourceWeekKey) => {
          const weekTodos = appData.todos[sourceWeekKey]?.[project.id];
          if (!weekTodos) return;

          DAYS.forEach((sourceDay: Day) => {
            if (sourceWeekKey === weekKey && DAY_INDEX[sourceDay] > DAY_INDEX[displayDay]) return;
            (weekTodos[sourceDay] || []).forEach((todo: Todo) => {
              const isOverdueCarry = todo.status !== 'pending' && (sourceWeekKey !== weekKey || sourceDay !== displayDay);
              if (todo.status === 'pending' && (sourceWeekKey !== weekKey || sourceDay !== displayDay)) return;
              if (isOverdueCarry && DAY_INDEX[displayDay] > overdueCutoffIndex) return;
              if (isOverdueCarry && todo.done) return;
              visibleTasks.push({
                todo,
                sourceWeekKey,
                sourceDay,
                displayDay,
                isOverdueCarry
              });
            });
          });
        });
        map.set(getProjectDayKey(project.id, displayDay), visibleTasks);
      });
    });

    return map;
  }, [appData.todos, overdueCutoffIndex, priorWeekKeys, visibleProjects, weekKey]);

  const weekStats = useMemo(() => {
    const projectPercentages: Record<string, string> = {};
    const dayPercentages = {} as Record<Day, number>;
    let overallTotal = 0;
    let overallDone = 0;

    DAYS.forEach((day: Day) => {
      let dayTotal = 0;
      let dayDone = 0;

      visibleProjects.forEach((project: Project) => {
        const weekTodos = appData.todos[weekKey]?.[project.id];
        const projectDayTodos = weekTodos?.[day] || [];
        const measurableDayTodos = projectDayTodos.filter((todo: Todo) => todo.status !== 'pending');
        dayTotal += measurableDayTodos.length;
        dayDone += measurableDayTodos.filter((todo: Todo) => todo.done).length;
      });

      dayPercentages[day] = dayTotal === 0 ? 0 : Math.round((dayDone / dayTotal) * 100);
      overallTotal += dayTotal;
      overallDone += dayDone;
    });

    visibleProjects.forEach((project: Project) => {
      const weekTodos = appData.todos[weekKey]?.[project.id];
      if (!weekTodos) {
        projectPercentages[project.id] = '0%';
        return;
      }

      let total = 0;
      let done = 0;
      DAYS.forEach((day: Day) => {
        const measurable = (weekTodos[day] || []).filter((todo: Todo) => todo.status !== 'pending');
        total += measurable.length;
        done += measurable.filter((todo: Todo) => todo.done).length;
      });
      projectPercentages[project.id] = total === 0 ? '0%' : `${Math.round((done / total) * 100)}%`;
    });

    return {
      projectPercentages,
      dayPercentages,
      totalPercentage: overallTotal === 0 ? '0%' : `${Math.round((overallDone / overallTotal) * 100)}%`
    };
  }, [appData.todos, visibleProjects, weekKey]);

  const getTodoByLocation = (targetWeekKey: string, pid: string, sourceDay: Day, todoId: string) =>
    appData.todos[targetWeekKey]?.[pid]?.[sourceDay]?.find((item) => item.id === todoId) || null;

  const isSubtaskDraftForTodo = (draft: SubtaskDraftState | null, pid: string, sourceWeekKey: string, sourceDay: Day, todoId: string) =>
    Boolean(
      draft &&
      draft.pid === pid &&
      draft.sourceWeekKey === sourceWeekKey &&
      draft.sourceDay === sourceDay &&
      draft.todoId === todoId
    );

  const getVisibleTasksForCell = (projectId: string, displayDay: Day): CellTodoView[] => {
    return visibleTasksByCell.get(getProjectDayKey(projectId, displayDay)) || [];
  };

  // Actions
  const closeProjectModal = () => {
    setShowProjectModal(false);
    setProjectModalMode('create');
    setEditingProjectId(null);
    setNewProjectName('');
    setSelectedColor('#6c63ff');
  };

  const openCreateProjectModal = () => {
    setProjectModalMode('create');
    setEditingProjectId(null);
    setNewProjectName('');
    setSelectedColor('#6c63ff');
    setShowProjectModal(true);
  };

  const openRenameProjectModal = (projectId: string) => {
    const project = appData.projects.find((item: Project) => item.id === projectId);
    if (!project) return;
    setProjectModalMode('rename');
    setEditingProjectId(project.id);
    setNewProjectName(project.name);
    setSelectedColor(project.color);
    setShowProjectModal(true);
  };

  const saveProject = () => {
    if (!newProjectName.trim()) return;
    const trimmedName = newProjectName.trim();
    if (projectModalMode === 'rename' && editingProjectId) {
      setAppData((prev: AppData) => ({
        ...prev,
        projects: prev.projects.map((project: Project) =>
          project.id === editingProjectId
            ? { ...project, name: trimmedName, color: selectedColor }
            : project
        )
      }));
      showToast('项目已更新');
      closeProjectModal();
      return;
    }

    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: trimmedName,
      color: selectedColor,
      archived: false
    };
    setAppData((prev: AppData) => ({ ...prev, projects: [...prev.projects, newProject] }));
    closeProjectModal();
  };

  const openProjectContextMenu = (event: React.MouseEvent<HTMLDivElement>, projectId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setTodoContextMenu(null);
    setProjectContextMenu({
      x: event.clientX,
      y: event.clientY,
      projectId
    });
  };

  const reorderProjects = (draggedProjectId: string, targetProjectId: string, position: 'before' | 'after') => {
    if (draggedProjectId === targetProjectId) return;

    setAppData((prev: AppData) => {
      const visibleOrder = prev.projects.filter((project: Project) => !project.archived);
      const fromIndex = visibleOrder.findIndex((project: Project) => project.id === draggedProjectId);
      const targetIndex = visibleOrder.findIndex((project: Project) => project.id === targetProjectId);
      if (fromIndex === -1 || targetIndex === -1) return prev;

      const nextVisibleOrder = [...visibleOrder];
      const [movingProject] = nextVisibleOrder.splice(fromIndex, 1);
      let insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      if (fromIndex < insertIndex) {
        insertIndex -= 1;
      }
      nextVisibleOrder.splice(insertIndex, 0, movingProject);

      let nextVisibleCursor = 0;
      return {
        ...prev,
        projects: prev.projects.map((project: Project) => {
          if (project.archived) return project;
          const reorderedProject = nextVisibleOrder[nextVisibleCursor];
          nextVisibleCursor += 1;
          return reorderedProject;
        })
      };
    });
  };

  const getProjectDropPosition = (event: React.DragEvent<HTMLDivElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  const handleProjectDragStart = (event: React.DragEvent<HTMLDivElement>, projectId: string) => {
    setDraggingProjectId(projectId);
    setProjectContextMenu(null);
    setTodoContextMenu(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', projectId);
  };

  const handleProjectDragOver = (event: React.DragEvent<HTMLDivElement>, projectId: string) => {
    if (!draggingProjectId || draggingProjectId === projectId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const position = getProjectDropPosition(event);
    if (dragOverProject?.projectId !== projectId || dragOverProject.position !== position) {
      setDragOverProject({ projectId, position });
    }
  };

  const handleProjectDragLeave = (event: React.DragEvent<HTMLDivElement>, projectId: string) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
    if (dragOverProject?.projectId === projectId) {
      setDragOverProject(null);
    }
  };

  const handleProjectDrop = (event: React.DragEvent<HTMLDivElement>, targetProjectId: string) => {
    if (!draggingProjectId || draggingProjectId === targetProjectId) {
      setDragOverProject(null);
      return;
    }

    event.preventDefault();
    const position = getProjectDropPosition(event);
    reorderProjects(draggingProjectId, targetProjectId, position);
    setDragOverProject(null);
    setDraggingProjectId(null);
  };

  const handleProjectDragEnd = () => {
    setDraggingProjectId(null);
    setDragOverProject(null);
  };

  const archiveProject = (projectId: string, archived: boolean) => {
    setAppData((prev: AppData) => ({
      ...prev,
      projects: prev.projects.map((project: Project) =>
        project.id === projectId ? { ...project, archived } : project
      )
    }));
    if (addingTaskCell?.pid === projectId) {
      setAddingTaskCell(null);
      setTempTaskText('');
    }
    if (subtaskDraft?.pid === projectId) {
      setSubtaskDraft(null);
      setTempSubtaskText('');
    }
    setProjectContextMenu(null);
    showToast(archived ? '项目已归档' : '项目已恢复');
  };

  const deleteProject = (projectId: string) => {
    const removedTodoIds = new Set<string>();
    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      next.projects = next.projects.filter((project: Project) => project.id !== projectId);
      Object.keys(next.todos).forEach((wk) => {
        const projectTodos = next.todos[wk]?.[projectId];
        if (projectTodos) {
          DAYS.forEach((day: Day) => {
            (projectTodos[day] || []).forEach((todo: Todo) => removedTodoIds.add(todo.id));
          });
          delete next.todos[wk][projectId];
        }
        if (Object.keys(next.todos[wk] || {}).length === 0) {
          delete next.todos[wk];
        }
      });
      next.relations = next.relations.filter(
        (relation: TodoRelation) => !removedTodoIds.has(relation.fromId) && !removedTodoIds.has(relation.toId)
      );
      return next;
    });
    if (editingProjectId === projectId) {
      closeProjectModal();
    }
    if (addingTaskCell?.pid === projectId) {
      setAddingTaskCell(null);
      setTempTaskText('');
    }
    if (subtaskDraft?.pid === projectId) {
      setSubtaskDraft(null);
      setTempSubtaskText('');
    }
    setSelectedLineageTodoId((prev) => (prev && removedTodoIds.has(prev) ? null : prev));
    setProjectContextMenu(null);
    showToast('项目及其任务已删除');
  };

  const startAddingTodo = (pid: string, day: Day, parentTodoId?: string) => {
    setAddingTaskCell({ pid, day, parentTodoId });
    setEditingTodoId(null);
    setSubtaskDraft(null);
    setTempSubtaskText('');
    setTempTaskText('');
  };

  const startEditingTodo = (t: Todo) => {
    // If a toggle was pending (from the first click of this double click), cancel it
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setEditingTodoId(t.id);
    setAddingTaskCell(null);
    setSubtaskDraft(null);
    setTempSubtaskText('');
    setTempTaskText(t.text);
  };

  const startAddingSubtask = (pid: string, sourceWeekKey: string, sourceDay: Day, todoId: string) => {
    setTodoContextMenu(null);
    setEditingTodoId(null);
    setAddingTaskCell(null);
    setSubtaskDraft({ pid, sourceWeekKey, sourceDay, todoId });
    setTempTaskText('');
    setTempSubtaskText('');
  };

  const startEditingSubtask = (
    pid: string,
    sourceWeekKey: string,
    sourceDay: Day,
    todoId: string,
    subtask: Subtask
  ) => {
    setEditingTodoId(null);
    setAddingTaskCell(null);
    setSubtaskDraft({ pid, sourceWeekKey, sourceDay, todoId, subtaskId: subtask.id });
    setTempTaskText('');
    setTempSubtaskText(subtask.text);
  };

  const saveSubtaskDraft = (displayDay?: Day) => {
    if (!subtaskDraft) return;

    const trimmed = tempSubtaskText.trim();
    const { pid, sourceWeekKey, sourceDay, todoId, subtaskId } = subtaskDraft;

    if (!trimmed && !subtaskId) {
      setSubtaskDraft(null);
      setTempSubtaskText('');
      return;
    }

    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      const todo = next.todos[sourceWeekKey]?.[pid]?.[sourceDay]?.find((item: Todo) => item.id === todoId);
      if (!todo) return prev;

      if (!Array.isArray(todo.subtasks)) todo.subtasks = [];

      if (subtaskId) {
        const targetSubtask = todo.subtasks.find((item: Subtask) => item.id === subtaskId);
        if (targetSubtask) {
          if (trimmed) {
            targetSubtask.text = trimmed;
          }
        }
      } else if (trimmed) {
        todo.subtasks.push({
          id: Math.random().toString(36).substr(2, 9),
          text: trimmed,
          done: false
        });
      }

      syncTodoCompletionFromSubtasks(todo, displayDay ?? todo.completedDay ?? todo.scheduledDay);
      return next;
    });

    setSubtaskDraft(null);
    setTempSubtaskText('');
  };

  const saveInlineTodo = () => {
    if (editingTodoId) {
      setAppData((prev: AppData) => {
        const next: AppData = JSON.parse(JSON.stringify(prev));
        Object.keys(next.todos).forEach(wk => {
          Object.keys(next.todos[wk]).forEach(pid => {
            DAYS.forEach(day => {
              const list = next.todos[wk][pid][day];
              const todo = list?.find(t => t.id === editingTodoId);
              if (todo) todo.text = tempTaskText.trim() || todo.text;
            });
          });
        });
        return next;
      });
      setEditingTodoId(null);
    } else if (addingTaskCell) {
      if (!tempTaskText.trim()) {
        setAddingTaskCell(null);
        return;
      }
      const { pid, day, parentTodoId } = addingTaskCell;
      const newTodo: Todo = {
        id: Math.random().toString(36).substr(2, 9),
        text: tempTaskText.trim(),
        done: false,
        status: 'active',
        scheduledDay: day,
        completedDay: null,
        subtasks: []
      };
      
      setAppData((prev: AppData) => {
        const next: AppData = JSON.parse(JSON.stringify(prev));
        if (!next.todos[weekKey]) next.todos[weekKey] = {};
        if (!next.todos[weekKey][pid]) next.todos[weekKey][pid] = { mon: [], tue: [], wed: [], thu: [], fri: [] };
        if (!next.todos[weekKey][pid][day]) next.todos[weekKey][pid][day] = [];
        next.todos[weekKey][pid][day].push(newTodo);
        if (parentTodoId) {
          if (!Array.isArray(next.relations)) next.relations = [];
          next.relations.push({
            id: Math.random().toString(36).substr(2, 9),
            fromId: parentTodoId,
            toId: newTodo.id,
            type: 'followup',
            createdAt: new Date().toISOString()
          });
        }
        return next;
      });
      setAddingTaskCell(null);
    }
    setTempTaskText('');
  };

  const toggleTodo = (pid: string, sourceWeekKey: string, sourceDay: Day, actionDay: Day, tid: string) => {
    if (draggingTodoId) return;
    const targetTodo = getTodoByLocation(sourceWeekKey, pid, sourceDay, tid);
    if (targetTodo?.status === 'pending' && !targetTodo.done) {
      showToast('任务处于待定中，请先恢复执行');
      return;
    }
    // If we're already waiting for a click, this might be a double click
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return; 
    }

    // Delay the toggle to see if a double click follows
    clickTimeoutRef.current = setTimeout(() => {
      setAppData((prev: AppData) => {
        const next: AppData = JSON.parse(JSON.stringify(prev));
        const list = next.todos[sourceWeekKey]?.[pid]?.[sourceDay];
        if (list) {
          const todo = list.find((t: Todo) => t.id === tid);
          if (todo) {
            const nextDone = !todo.done;
            todo.done = nextDone;
            todo.completedDay = nextDone ? actionDay : null;
            if (Array.isArray(todo.subtasks) && todo.subtasks.length > 0) {
              todo.subtasks = todo.subtasks.map((subtask: Subtask) => ({
                ...subtask,
                done: nextDone
              }));
              syncTodoCompletionFromSubtasks(todo, actionDay);
            }
          }
        }
        return next;
      });
      clickTimeoutRef.current = null;
    }, 200);
  };

  const setTodoStatus = (
    pid: string,
    sourceWeekKey: string,
    sourceDay: Day,
    tid: string,
    status: TodoStatus
  ) => {
    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      const todo = next.todos[sourceWeekKey]?.[pid]?.[sourceDay]?.find((item: Todo) => item.id === tid);
      if (!todo) return prev;
      todo.status = status;
      if (status === 'pending') {
        todo.done = false;
        todo.completedDay = null;
      } else {
        syncTodoCompletionFromSubtasks(todo, todo.completedDay ?? todo.scheduledDay);
      }
      return next;
    });
  };

  const toggleSubtask = (
    pid: string,
    sourceWeekKey: string,
    sourceDay: Day,
    todoId: string,
    subtaskId: string,
    displayDay: Day
  ) => {
    const todo = getTodoByLocation(sourceWeekKey, pid, sourceDay, todoId);
    if (!todo) return;
    if (todo.status === 'pending') {
      showToast('任务处于待定中，请先恢复执行');
      return;
    }

    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      const targetTodo = next.todos[sourceWeekKey]?.[pid]?.[sourceDay]?.find((item: Todo) => item.id === todoId);
      if (!targetTodo || !Array.isArray(targetTodo.subtasks)) return prev;

      const targetSubtask = targetTodo.subtasks.find((item: Subtask) => item.id === subtaskId);
      if (!targetSubtask) return prev;

      targetSubtask.done = !targetSubtask.done;
      syncTodoCompletionFromSubtasks(targetTodo, displayDay);
      return next;
    });
  };

  const navigateWeek = (offset: number) => {
    setCurrentMonday((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + offset * 7);
      return next;
    });
  };

  const navigateMonth = (offset: number) => {
    setCurrentMonday((prev) => {
      const nextMonthAnchor = new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
      return WeekUtil.getMonday(nextMonthAnchor);
    });
  };

  const moveTodo = (fromPid: string, fromWeekKey: string, fromDay: Day, toPid: string, toWeekKey: string, toDay: Day, tid: string) => {
    if (fromPid === toPid && fromWeekKey === toWeekKey && fromDay === toDay) return;
    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      if (!next.todos[fromWeekKey]) return prev;
      if (!next.todos[fromWeekKey][fromPid]) return prev;
      if (!next.todos[toWeekKey]) next.todos[toWeekKey] = {};
      if (!next.todos[toWeekKey][toPid]) next.todos[toWeekKey][toPid] = { mon: [], tue: [], wed: [], thu: [], fri: [] };

      const sourceList = next.todos[fromWeekKey][fromPid][fromDay] || [];
      const todoIndex = sourceList.findIndex((todo: Todo) => todo.id === tid);
      if (todoIndex < 0) return prev;

      const [movingTodo] = sourceList.splice(todoIndex, 1);
      movingTodo.scheduledDay = toDay;
      next.todos[toWeekKey][toPid][toDay].push(movingTodo);
      return next;
    });
  };

  const deleteTodo = (pid: string, sourceWeekKey: string, sourceDay: Day, tid: string) => {
    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      const list = next.todos[sourceWeekKey]?.[pid]?.[sourceDay];
      if (!list) return prev;

      next.todos[sourceWeekKey][pid][sourceDay] = list.filter((todo: Todo) => todo.id !== tid);
      if (Array.isArray(next.relations)) {
        next.relations = next.relations.filter((relation) => relation.fromId !== tid && relation.toId !== tid);
      }
      return next;
    });
    if (subtaskDraft && isSubtaskDraftForTodo(subtaskDraft, pid, sourceWeekKey, sourceDay, tid)) {
      setSubtaskDraft(null);
      setTempSubtaskText('');
    }
  };

  const deleteSubtask = (pid: string, sourceWeekKey: string, sourceDay: Day, todoId: string, subtaskId: string) => {
    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      const todo = next.todos[sourceWeekKey]?.[pid]?.[sourceDay]?.find((item: Todo) => item.id === todoId);
      if (!todo || !Array.isArray(todo.subtasks)) return prev;

      const beforeLength = todo.subtasks.length;
      todo.subtasks = todo.subtasks.filter((item: Subtask) => item.id !== subtaskId);
      if (todo.subtasks.length === beforeLength) return prev;

      syncTodoCompletionFromSubtasks(todo, todo.completedDay ?? todo.scheduledDay);
      return next;
    });

    if (
      subtaskDraft &&
      isSubtaskDraftForTodo(subtaskDraft, pid, sourceWeekKey, sourceDay, todoId) &&
      subtaskDraft.subtaskId === subtaskId
    ) {
      setSubtaskDraft(null);
      setTempSubtaskText('');
    }
  };

  const setParentForTodo = (parentId: string, childId: string) => {
    if (parentId === childId) {
      showToast('前序任务不能是自己');
      return;
    }

    const alreadyLinked = appData.relations.some(
      (relation) => relation.type === 'followup' && relation.fromId === parentId && relation.toId === childId
    );
    if (alreadyLinked) {
      setPendingParentLink(null);
      showToast('该前序任务已关联');
      return;
    }

    setAppData((prev: AppData) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      if (!Array.isArray(next.relations)) next.relations = [];

      next.relations = next.relations.filter(
        (relation) => !(relation.type === 'followup' && relation.toId === childId)
      );
      next.relations.push({
        id: Math.random().toString(36).substr(2, 9),
        fromId: parentId,
        toId: childId,
        type: 'followup',
        createdAt: new Date().toISOString()
      });
      return next;
    });

    setPendingParentLink(null);
    showToast('已关联前序任务');
  };

  const beginParentLink = (todoId: string, todoText: string) => {
    setPendingParentLink({ childId: todoId, childText: todoText });
    setTodoContextMenu(null);
    showToast('请选择前序任务');
  };

  const handleTodoPrimaryAction = (pid: string, sourceWeekKey: string, sourceDay: Day, actionDay: Day, tid: string) => {
    if (pendingParentLink) {
      setParentForTodo(tid, pendingParentLink.childId);
      return;
    }
    if (getTodoByLocation(sourceWeekKey, pid, sourceDay, tid)?.status === 'pending') {
      showToast('任务处于待定中，请右键恢复执行');
      return;
    }
    toggleTodo(pid, sourceWeekKey, sourceDay, actionDay, tid);
  };

  const handleLineageNodeClick = (todoId: string) => {
    if (pendingParentLink) {
      setParentForTodo(todoId, pendingParentLink.childId);
      return;
    }
    setSelectedLineageTodoId((prev) => (prev === todoId ? null : todoId));
  };

  const openTodoContextMenu = (
    event: React.MouseEvent<HTMLDivElement>,
    pid: string,
    sourceWeekKey: string,
    sourceDay: Day,
    displayDay: Day,
    todoId: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setTodoContextMenu({
      x: event.clientX,
      y: event.clientY,
      pid,
      sourceWeekKey,
      sourceDay,
      displayDay,
      todoId
    });
  };

  const parseDragPayload = (event: React.DragEvent<HTMLElement>): DragPayload | null => {
    const raw = event.dataTransfer.getData('application/x-weekplanner-todo');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.tid === 'string' &&
        typeof parsed.fromPid === 'string' &&
        typeof parsed.fromWeekKey === 'string' &&
        isDay(parsed.fromDay)
      ) {
        return { tid: parsed.tid, fromPid: parsed.fromPid, fromWeekKey: parsed.fromWeekKey, fromDay: parsed.fromDay };
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleTodoDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    pid: string,
    sourceWeekKey: string,
    day: Day,
    tid: string
  ) => {
    const payload: DragPayload = { tid, fromPid: pid, fromWeekKey: sourceWeekKey, fromDay: day };
    event.dataTransfer.setData('application/x-weekplanner-todo', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', tid);
    event.dataTransfer.effectAllowed = 'move';
    setTodoContextMenu(null);
    setDraggingTodoId(tid);
    setDraggingFrom(payload);
  };

  const handleTodoDragEnd = () => {
    if (dragEdgeTimerRef.current) {
      clearTimeout(dragEdgeTimerRef.current);
      dragEdgeTimerRef.current = null;
    }
    dragEdgeDirectionRef.current = 0;
    setDraggingTodoId(null);
    setDraggingFrom(null);
    setDragOverCell(null);
  };

  const handleCellDragOver = (event: React.DragEvent<HTMLDivElement>, pid: string, day: Day) => {
    const hasInternalTodo =
      Boolean(draggingFrom) ||
      event.dataTransfer.types.includes('application/x-weekplanner-todo') ||
      event.dataTransfer.types.includes('text/plain');
    if (!hasInternalTodo) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverCell?.pid !== pid || dragOverCell?.day !== day) {
      setDragOverCell({ pid, day });
    }
  };

  const handleCellDragLeave = (pid: string, day: Day) => {
    if (dragOverCell?.pid === pid && dragOverCell?.day === day) {
      setDragOverCell(null);
    }
  };

  const handleCellDrop = (event: React.DragEvent<HTMLDivElement>, toPid: string, toDay: Day) => {
    event.preventDefault();
    const payload = parseDragPayload(event) || draggingFrom;
    setDragOverCell(null);
    if (!payload) return;
    moveTodo(payload.fromPid, payload.fromWeekKey, payload.fromDay, toPid, weekKey, toDay, payload.tid);
    setDraggingFrom(null);
    setDraggingTodoId(null);
  };

  const moveTodoToRelativeWeek = (
    pid: string,
    sourceWeekKey: string,
    sourceDay: Day,
    displayDay: Day,
    tid: string,
    offset: number
  ) => {
    const targetWeekKey = WeekUtil.shiftWeekKey(weekKey, offset);
    moveTodo(pid, sourceWeekKey, sourceDay, pid, targetWeekKey, displayDay, tid);
    setTodoContextMenu(null);
    showToast(`已移到 ${targetWeekKey}`);
  };

  const writeDataToHandle = async (targetHandle: any, data: AppData) => {
    if (!targetHandle) return;
    try {
      const markdown = FileFormat.serializeMarkdown(data);
      const desktopBridge = getDesktopBridge();
      if (desktopBridge && typeof targetHandle?.filePath === 'string') {
        await desktopBridge.writeMarkdownFile(targetHandle.filePath, markdown);
        return;
      }
      const writable = await targetHandle.createWritable();
      await writable.write(markdown);
      await writable.close();
    } catch (e) {
      console.warn('Sync failed', e);
    }
  };

  const syncToFile = async (data: AppData) => {
    if (!fileHandle) return;
    await writeDataToHandle(fileHandle, data);
  };

  const bindFile = async () => {
    try {
      const desktopBridge = getDesktopBridge();
      if (desktopBridge) {
        const result = await desktopBridge.openMarkdownFile();
        if (!result) {
          setShowDropdown(false);
          return;
        }

        const nextHandle = { filePath: result.filePath, name: result.name };
        setFileHandle(nextHandle);
        const data = FileFormat.parseMarkdown(result.content);
        if (hasAppDataContent(data)) {
          setAppData(data);
          showToast('已绑定文件并导入');
        } else {
          await writeDataToHandle(nextHandle, appData);
          showToast('已绑定空文件，已写入当前数据');
        }
        setShowDropdown(false);
        return;
      }

      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Markdown File', accept: { 'text/markdown': ['.md'] } }]
      });
      if (handle.requestPermission) {
        const permission = await handle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
          showToast('未授予文件写入权限');
          setShowDropdown(false);
          return;
        }
      }
      setFileHandle(handle);
      const file = await handle.getFile();
      const text = await file.text();
      const data = FileFormat.parseMarkdown(text);
      if (hasAppDataContent(data)) {
        setAppData(data);
        showToast('已绑定文件并导入');
      } else {
        await writeDataToHandle(handle, appData);
        showToast('已绑定空文件，已写入当前数据');
      }
    } catch (e) {}
    setShowDropdown(false);
  };

  const exportMD = () => {
    const content = FileFormat.serializeMarkdown(appData);
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      void (async () => {
        const saved = await desktopBridge.saveMarkdownAs(`weekplanner-${weekKey}.md`, content);
        if (saved) {
          showToast('已导出 Markdown');
        }
        setShowDropdown(false);
      })();
      return;
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekplanner-${weekKey}.md`;
    a.click();
    showToast('已导出 Markdown');
    setShowDropdown(false);
  };

  return (
    <div className="app-root">
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">W</div>
          <span className="header-title">WeekPlanner</span>
        </div>

        <nav className="week-nav">
          <button className="week-nav-btn" onClick={() => (viewMode === 'month' ? navigateMonth(-1) : navigateWeek(-1))}>‹</button>
          <button
            className="week-nav-btn week-nav-today"
            onClick={() =>
              setCurrentMonday(
                viewMode === 'month'
                  ? WeekUtil.getMonday(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                  : WeekUtil.getMonday(new Date())
              )
            }
          >
            {viewMode === 'month' ? '本月' : '今天'}
          </button>
          <div style={{ textAlign: 'center' }}>
            {viewMode === 'month' ? (
              <>
                <div className="week-date-range">
                  {currentMonthDate.getFullYear()}年 {(currentMonthDate.getMonth() + 1).toString().padStart(2, '0')}月
                </div>
                <div className="week-label">月视图</div>
              </>
            ) : (
              <>
                <div className="week-date-range">
                  {WeekUtil.formatDate(daysInWeek[0])} — {WeekUtil.formatDate(daysInWeek[4])}
                </div>
                <div className="week-label">{currentMonday.getFullYear()} {weekKey}</div>
              </>
            )}
          </div>
          <button className="week-nav-btn" onClick={() => (viewMode === 'month' ? navigateMonth(1) : navigateWeek(1))}>›</button>
          <button className={`week-nav-btn ${viewMode === 'board' ? 'week-nav-view-active' : ''}`} onClick={() => setViewMode('board')}>周视图</button>
          <button className={`week-nav-btn ${viewMode === 'month' ? 'week-nav-view-active' : ''}`} onClick={() => setViewMode('month')}>月视图</button>
          <button className={`week-nav-btn ${viewMode === 'lineage' ? 'week-nav-view-active' : ''}`} onClick={() => setViewMode('lineage')}>关系图</button>
        </nav>

        <div className="header-actions">
          <button
            className="theme-toggle-btn"
            onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {themeMode === 'dark' ? '☀︎ 浅色' : '☾ 深色'}
          </button>
          <div className="sync-toolbar">
            <button className="sync-btn" onClick={() => setShowDropdown(!showDropdown)}>
              {fileHandle ? '🟢 已同步' : '⋯ 数据'}
            </button>
            {showDropdown && (
              <div className="sync-dropdown">
                <button className="sync-dropdown-item" onClick={bindFile}>🔗 重新绑定本地物理文件</button>
                <button className="sync-dropdown-item" onClick={exportMD}>📥 导出并另存为...</button>
                <button className="sync-dropdown-item" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.md';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (re) => {
                        const data = FileFormat.parseMarkdown(re.target?.result as string);
                        if (hasAppDataContent(data)) {
                          setAppData(data);
                          showToast('导入成功');
                        }
                      };
                      reader.readAsText(file);
                    }
                  };
                  input.click();
                  setShowDropdown(false);
                }}>📤 导入 Markdown</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-container">
        {pendingParentLink && (
          <div className="linking-banner">
            <span>正在为 “{pendingParentLink.childText}” 选择前序任务，点击任意任务完成关联</span>
            <button className="linking-banner-btn" onClick={() => setPendingParentLink(null)}>
              取消
            </button>
          </div>
        )}
        {viewMode === 'lineage' ? (
          <div className="lineage-panel">
            <div className="lineage-header">
              <h3>任务来龙去脉</h3>
              <div className="lineage-header-meta">
                <span>{weekKey}</span>
              </div>
            </div>
            {lineageGraph.edges.length === 0 ? (
              <div className="lineage-empty">还没有任务关系。可以在任务上点击 `↳` 派生后续任务。</div>
            ) : (
              <div className="lineage-canvas">
                <svg width={lineageGraph.width} height={lineageGraph.height}>
                  <rect
                    x="0"
                    y="0"
                    width={lineageGraph.width}
                    height={lineageGraph.height}
                    fill="transparent"
                    onClick={() => setSelectedLineageTodoId(null)}
                  />
                  {lineageGraph.edges.map((edge: TodoRelation) => {
                    const from = lineageGraph.positions.get(edge.fromId);
                    const to = lineageGraph.positions.get(edge.toId);
                    if (!from || !to) return null;
                    const startX = from.x + 118;
                    const arrowTipX = to.x - 116;
                    const arrowBaseX = arrowTipX - 10;
                    const midX = (startX + arrowBaseX) / 2;
                    const isActive = lineageFocus.activeEdgeIds.has(edge.id);
                    const isDimmed = lineageFocus.hasSelection && !isActive;
                    return (
                      <g key={edge.id} className={`lineage-edge-group ${isActive ? 'is-active' : ''} ${isDimmed ? 'is-dimmed' : ''}`}>
                        <path
                          d={`M ${startX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${arrowBaseX} ${to.y}`}
                          className={`lineage-edge ${isActive ? 'is-active' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
                        />
                        <path
                          d={`M ${arrowBaseX} ${to.y - 4.5} L ${arrowTipX} ${to.y} L ${arrowBaseX} ${to.y + 4.5} Z`}
                          className={`lineage-arrow-head ${isActive ? 'is-active' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
                        />
                      </g>
                    );
                  })}
                  {lineageGraph.nodeIds.map((id: string) => {
                    const pos = lineageGraph.positions.get(id);
                    const meta = todoMetaById.get(id);
                    if (!pos || !meta) return null;
                    const title = meta.todo.text.length > 26 ? `${meta.todo.text.slice(0, 26)}...` : meta.todo.text;
                    const isSelected = selectedLineageTodoId === id;
                    const isActive = lineageFocus.activeNodeIds.has(id);
                    const isDimmed = lineageFocus.hasSelection && !isActive;
                    return (
                      <g
                        key={id}
                        transform={`translate(${pos.x - 110}, ${pos.y - 40})`}
                        className="lineage-node-group"
                        onClick={(e: React.MouseEvent<SVGGElement>) => {
                          e.stopPropagation();
                          handleLineageNodeClick(id);
                        }}
                      >
                        <rect
                          width="220"
                          height="80"
                          rx="12"
                          className={`lineage-node ${meta.todo.done ? 'done' : ''} ${meta.todo.status === 'pending' ? 'pending' : ''} ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
                        />
                        <text x="12" y="28" className={`lineage-node-title ${isDimmed ? 'is-dimmed' : ''}`}>{title}</text>
                        <text x="12" y="52" className={`lineage-node-meta ${isDimmed ? 'is-dimmed' : ''}`}>
                          {meta.projectName} · {meta.day.toUpperCase()} {meta.todo.status === 'pending' ? '· 待定' : ''}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        ) : viewMode === 'month' ? (
          <div className="month-view-panel">
            <div className="month-view-header">
              <h3>{monthView.label}</h3>
              <span>点击日期可跳到对应周视图</span>
            </div>
            {monthView.weeks.length === 0 ? (
              <div className="month-view-empty">这个月还没有周数据。</div>
            ) : (
              <div className="month-calendar">
                {MONTH_VIEW_COLUMNS.map((column) => (
                  <div key={column.key} className="month-calendar-weekday">
                    {column.label}
                  </div>
                ))}
                {monthView.weeks.flatMap((week) =>
                  week.days.map((entry) => (
                    <button
                      key={`${week.weekKey}-${entry.key}`}
                      type="button"
                      className={`month-calendar-cell ${entry.isCurrentMonth ? '' : 'is-outside-month'} ${entry.key === 'sat' || entry.key === 'sun' ? 'is-weekend' : ''} ${entry.isCurrentWeek ? 'is-current-week' : ''} ${entry.isToday ? 'is-today' : ''}`}
                      onClick={() => {
                        setCurrentMonday(WeekUtil.getMonday(entry.date));
                        setViewMode('board');
                      }}
                    >
                      <div className="month-calendar-cell-head">
                        <span className="month-calendar-cell-day">{entry.date.getDate()}</span>
                        <span className="month-calendar-cell-range">{week.weekKey}</span>
                      </div>
                      <div className="month-calendar-cell-body">
                        {entry.items.length === 0 ? (
                          <div className="month-week-day-empty">无任务</div>
                        ) : (
                          entry.items.slice(0, 3).map((item) => (
                            <div
                              key={item.id}
                              className={`month-task-chip ${item.done ? 'done' : ''} ${item.status === 'pending' ? 'pending' : ''}`}
                            >
                              <span className="month-task-chip-text">{item.text}</span>
                              <span className="month-task-chip-project">{item.projectName}</span>
                            </div>
                          ))
                        )}
                        {entry.items.length > 3 && (
                          <div className="month-week-more">+{entry.items.length - 3} 个任务</div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h2 className="empty-title">{archivedProjects.length > 0 ? '没有进行中的项目' : '还没有项目'}</h2>
            <button className="btn btn-primary" onClick={openCreateProjectModal}>+ 新增项目</button>
            {archivedProjects.length > 0 && (
              <div className="archived-projects-panel">
                <div className="archived-projects-header">已归档项目 · {archivedProjects.length}</div>
                <div className="archived-projects-list">
                  {archivedProjects.map((project: Project) => (
                    <div key={project.id} className="archived-project-item">
                      <div className="archived-project-name">
                        <span className="project-color-dot" style={{ background: project.color }}></span>
                        <span>{project.name}</span>
                      </div>
                      <button className="archived-project-action" onClick={() => archiveProject(project.id, false)}>
                        恢复
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="matrix-wrapper">
            <div className="matrix">
              <div className="matrix-header-cell">项目</div>
              {daysInWeek.map((d, i) => (
                <div key={i} className={`matrix-header-cell ${new Date().toDateString() === d.toDateString() ? 'is-today' : ''}`}>
                  {DAYS[i].toUpperCase()} <br /> <small>{WeekUtil.formatDate(d)}</small>
                </div>
              ))}
              <div className="matrix-header-cell">进度</div>

              <div className="matrix-summary-label-cell">每日进度</div>
              {DAYS.map((day: Day) => {
                const percentage = weekStats.dayPercentages[day] ?? 0;
                return (
                  <div key={day} className="matrix-summary-cell">
                    <div className="summary-status-wrapper">
                      <div className="progress-ring-container">
                        <svg className="progress-ring" width="16" height="16">
                          <circle className="progress-ring-track" cx="8" cy="8" r="6" />
                          <circle
                            className="progress-ring-fill"
                            cx="8" cy="8" r="6"
                            style={{
                              strokeDashoffset: 37.7 - (37.7 * percentage) / 100,
                              strokeDasharray: 37.7,
                              stroke: percentage === 100 ? 'var(--success)' : 'var(--accent)'
                            }}
                          />
                        </svg>
                      </div>
                      <span className="summary-progress-text">{percentage}%</span>
                    </div>
                  </div>
                );
              })}
              <div className="matrix-summary-cell total-stats">
                {weekStats.totalPercentage}
              </div>

              {visibleProjects.map(p => (
                <React.Fragment key={p.id}>
                  {(() => {
                    const isDraggingProjectRow = draggingProjectId === p.id;
                    const isProjectDropTarget = dragOverProject?.projectId === p.id;
                    const rowStateClass = isDraggingProjectRow
                      ? 'project-row-active'
                      : isProjectDropTarget
                        ? `project-row-drop-${dragOverProject.position}`
                        : '';

                    return (
                      <>
                  <div
                    className={`project-cell ${isDraggingProjectRow ? 'dragging' : ''} ${isProjectDropTarget ? `drag-over-${dragOverProject.position}` : ''} ${rowStateClass}`}
                    draggable
                    onDragStart={(e: React.DragEvent<HTMLDivElement>) => handleProjectDragStart(e, p.id)}
                    onDragOver={(e: React.DragEvent<HTMLDivElement>) => handleProjectDragOver(e, p.id)}
                    onDragLeave={(e: React.DragEvent<HTMLDivElement>) => handleProjectDragLeave(e, p.id)}
                    onDrop={(e: React.DragEvent<HTMLDivElement>) => handleProjectDrop(e, p.id)}
                    onDragEnd={handleProjectDragEnd}
                    onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => openProjectContextMenu(e, p.id)}
                  >
                    <span className="project-color-dot" style={{background: p.color}}></span>
                    <span className="project-name">{p.name}</span>
                  </div>
                  {DAYS.map(day => {
                    const tasks = getVisibleTasksForCell(p.id, day);
                    const isAdding = addingTaskCell?.pid === p.id && addingTaskCell?.day === day;
                    const isDragOver = dragOverCell?.pid === p.id && dragOverCell?.day === day;
                    return (
                      <div
                        key={day}
                        className={`todo-cell ${isDragOver ? 'drag-over' : ''} ${rowStateClass}`}
                        onDragOver={(e: React.DragEvent<HTMLDivElement>) => handleCellDragOver(e, p.id, day)}
                        onDragLeave={() => handleCellDragLeave(p.id, day)}
                        onDrop={(e: React.DragEvent<HTMLDivElement>) => handleCellDrop(e, p.id, day)}
                      >
                        {tasks.map((taskView) => {
                          const { todo, sourceWeekKey, sourceDay, isOverdueCarry } = taskView;
                          const isEditing = editingTodoId === todo.id;
                          const subtaskProgress = getSubtaskProgress(todo);
                          const isDraftForTodo = isSubtaskDraftForTodo(subtaskDraft, p.id, sourceWeekKey, sourceDay, todo.id);
                          const isAddingSubtask = isDraftForTodo && !subtaskDraft?.subtaskId;
                          const editingSubtaskId = isDraftForTodo ? subtaskDraft?.subtaskId ?? null : null;
                          const showSubtasks = subtaskProgress.total > 0 || isAddingSubtask || Boolean(editingSubtaskId);
                          const completionNote =
                            todo.done && todo.completedDay && todo.completedDay !== sourceDay
                              ? `${todo.completedDay.toUpperCase()} 完成`
                              : null;
                          const pendingNote = todo.status === 'pending' ? '待定' : null;
                          const carryNote =
                            sourceWeekKey !== weekKey
                              ? `${sourceWeekKey} · ${sourceDay.toUpperCase()}`
                              : `计划 ${sourceDay.toUpperCase()}`;
                          return isEditing ? (
                            <input 
                              key={`${todo.id}-${sourceWeekKey}-${sourceDay}`}
                              className="inline-todo-input"
                              autoFocus
                              value={tempTaskText}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempTaskText(e.target.value)}
                              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter' && !isImeComposing(e)) saveInlineTodo();
                                if (e.key === 'Escape') setEditingTodoId(null);
                              }}
                              onBlur={saveInlineTodo}
                            />
                          ) : (
                            <div
                              key={`${todo.id}-${sourceWeekKey}-${sourceDay}-${day}`}
                              className={`todo-item ${todo.done ? 'done' : ''} ${todo.status === 'pending' ? 'pending' : ''} ${draggingTodoId === todo.id ? 'dragging' : ''} ${isOverdueCarry ? 'overdue-view' : ''}`}
                              draggable={!todo.done}
                              onDragStart={(e: React.DragEvent<HTMLDivElement>) => handleTodoDragStart(e, p.id, sourceWeekKey, sourceDay, todo.id)}
                              onDragEnd={handleTodoDragEnd}
                              onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => openTodoContextMenu(e, p.id, sourceWeekKey, sourceDay, day, todo.id)}
                              onClick={() => handleTodoPrimaryAction(p.id, sourceWeekKey, sourceDay, day, todo.id)}
                              onDoubleClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (pendingParentLink) return;
                                startEditingTodo(todo);
                              }}
                            >
                              <div className="custom-checkbox">
                                <input type="checkbox" checked={todo.done} readOnly />
                                <span className="checkmark"></span>
                              </div>
                              <div className="todo-main">
                                <div className="todo-main-top">
                                  <span className="todo-text">{todo.text}</span>
                                  {(pendingNote || isOverdueCarry || completionNote) && (
                                    <span className="todo-meta">
                                      {pendingNote || (isOverdueCarry ? carryNote : completionNote)}
                                    </span>
                                  )}
                                  {subtaskProgress.total > 0 && (
                                    <span className="todo-subtask-summary">
                                      子任务 {subtaskProgress.completed}/{subtaskProgress.total}
                                    </span>
                                  )}
                                </div>
                                {showSubtasks && (
                                  <div
                                    className="todo-subtasks"
                                    onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                                    onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                                  >
                                    {(todo.subtasks || []).map((subtask) => {
                                      const isEditingSubtask = editingSubtaskId === subtask.id;
                                      return isEditingSubtask ? (
                                        <input
                                          key={subtask.id}
                                          className="inline-subtask-input"
                                          autoFocus
                                          value={tempSubtaskText}
                                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempSubtaskText(e.target.value)}
                                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                            if (e.key === 'Enter' && !isImeComposing(e)) saveSubtaskDraft(day);
                                            if (e.key === 'Escape') {
                                              setSubtaskDraft(null);
                                              setTempSubtaskText('');
                                            }
                                          }}
                                          onBlur={() => saveSubtaskDraft(day)}
                                        />
                                      ) : (
                                        <div key={subtask.id} className={`todo-subtask-item ${subtask.done ? 'done' : ''}`}>
                                          <button
                                            className={`todo-subtask-toggle ${subtask.done ? 'done' : ''}`}
                                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                              e.stopPropagation();
                                              toggleSubtask(p.id, sourceWeekKey, sourceDay, todo.id, subtask.id, day);
                                            }}
                                          >
                                            {subtask.done ? '✓' : ''}
                                          </button>
                                          <span className="todo-subtask-text">{subtask.text}</span>
                                          <div
                                            className="todo-subtask-menu-wrap"
                                            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                                            onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              className="todo-subtask-more-btn"
                                              aria-label="子任务操作"
                                            >
                                              ⋯
                                            </button>
                                            <div className="todo-subtask-actions">
                                              <button
                                                className="todo-subtask-action-btn"
                                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                                  e.stopPropagation();
                                                  startEditingSubtask(p.id, sourceWeekKey, sourceDay, todo.id, subtask);
                                                }}
                                              >
                                                重命名
                                              </button>
                                              <button
                                                className="todo-subtask-action-btn danger"
                                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                                  e.stopPropagation();
                                                  deleteSubtask(p.id, sourceWeekKey, sourceDay, todo.id, subtask.id);
                                                }}
                                              >
                                                删除
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {isAddingSubtask ? (
                                      <input
                                        className="inline-subtask-input"
                                        autoFocus
                                        placeholder="输入子任务..."
                                        value={tempSubtaskText}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempSubtaskText(e.target.value)}
                                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                          if (e.key === 'Enter' && !isImeComposing(e)) saveSubtaskDraft(day);
                                          if (e.key === 'Escape') {
                                            setSubtaskDraft(null);
                                            setTempSubtaskText('');
                                          }
                                        }}
                                        onBlur={() => saveSubtaskDraft(day)}
                                      />
                                    ) : (
                                      <button
                                        className="todo-subtask-add-btn"
                                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                          e.stopPropagation();
                                          startAddingSubtask(p.id, sourceWeekKey, sourceDay, todo.id);
                                        }}
                                      >
                                        + 添加子任务
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                className="todo-link-btn"
                                title="基于此任务派生后续任务"
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation();
                                  startAddingTodo(p.id, day, todo.id);
                                }}
                              >
                                ↳
                              </button>
                            </div>
                          );
                        })}
                        
                        {isAdding ? (
                          <input 
                            className="inline-todo-input"
                            autoFocus
                            placeholder={addingTaskCell?.parentTodoId ? '输入后续任务...' : '输入任务...'}
                            value={tempTaskText}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempTaskText(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === 'Enter' && !isImeComposing(e)) saveInlineTodo();
                              if (e.key === 'Escape') setAddingTaskCell(null);
                            }}
                            onBlur={saveInlineTodo}
                          />
                        ) : (
                          <button className="add-todo-btn" onClick={() => startAddingTodo(p.id, day)}>+ 新增任务</button>
                        )}
                      </div>
                    );
                  })}
                  <div className={`stats-cell ${rowStateClass}`}>
                    <div className="stats-badge">
                      {weekStats.projectPercentages[p.id] || '0%'}
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </React.Fragment>
              ))}

            </div>
            <div className="add-project-row">
               <button className="add-project-btn" onClick={openCreateProjectModal}>+ 新增项目</button>
            </div>
            {archivedProjects.length > 0 && (
              <div className="archived-projects-panel">
                <div className="archived-projects-header">已归档项目 · {archivedProjects.length}</div>
                <div className="archived-projects-list">
                  {archivedProjects.map((project: Project) => (
                    <div key={project.id} className="archived-project-item">
                      <div className="archived-project-name">
                        <span className="project-color-dot" style={{ background: project.color }}></span>
                        <span>{project.name}</span>
                      </div>
                      <button className="archived-project-action" onClick={() => archiveProject(project.id, false)}>
                        恢复
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {projectContextMenu && (
        <div
          className="todo-context-menu"
          style={{ left: projectContextMenu.x, top: projectContextMenu.y }}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => e.preventDefault()}
        >
          <button
            className="todo-context-menu-item"
            onClick={() => {
              openRenameProjectModal(projectContextMenu.projectId);
              setProjectContextMenu(null);
            }}
          >
            重命名
          </button>
          <button
            className="todo-context-menu-item"
            onClick={() => archiveProject(projectContextMenu.projectId, true)}
          >
            归档
          </button>
          <button
            className="todo-context-menu-item danger"
            onClick={() => deleteProject(projectContextMenu.projectId)}
          >
            删除
          </button>
        </div>
      )}

      {todoContextMenu && (
        <div
          className="todo-context-menu"
          style={{ left: todoContextMenu.x, top: todoContextMenu.y }}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => e.preventDefault()}
        >
          <button
            className="todo-context-menu-item"
            onClick={() => {
              const todo = getTodoByLocation(
                todoContextMenu.sourceWeekKey,
                todoContextMenu.pid,
                todoContextMenu.sourceDay,
                todoContextMenu.todoId
              );
              if (todo) {
                startEditingTodo(todo);
              }
              setTodoContextMenu(null);
            }}
          >
            重命名
          </button>
          <button
            className="todo-context-menu-item"
            onClick={() => {
              toggleTodo(
                todoContextMenu.pid,
                todoContextMenu.sourceWeekKey,
                todoContextMenu.sourceDay,
                todoContextMenu.displayDay,
                todoContextMenu.todoId
              );
              setTodoContextMenu(null);
            }}
          >
            {getTodoByLocation(
              todoContextMenu.sourceWeekKey,
              todoContextMenu.pid,
              todoContextMenu.sourceDay,
              todoContextMenu.todoId
            )?.done
              ? '标记未完成'
              : '标记完成'}
          </button>
          <button
            className="todo-context-menu-item"
            onClick={() => {
              const todo = getTodoByLocation(
                todoContextMenu.sourceWeekKey,
                todoContextMenu.pid,
                todoContextMenu.sourceDay,
                todoContextMenu.todoId
              );
              if (!todo) {
                setTodoContextMenu(null);
                return;
              }
              setTodoStatus(
                todoContextMenu.pid,
                todoContextMenu.sourceWeekKey,
                todoContextMenu.sourceDay,
                todoContextMenu.todoId,
                todo.status === 'pending' ? 'active' : 'pending'
              );
              setTodoContextMenu(null);
            }}
          >
            {getTodoByLocation(
              todoContextMenu.sourceWeekKey,
              todoContextMenu.pid,
              todoContextMenu.sourceDay,
              todoContextMenu.todoId
            )?.status === 'pending'
              ? '恢复执行'
              : '设为待定'}
          </button>
          <button
            className="todo-context-menu-item"
            onClick={() => {
              startAddingSubtask(
                todoContextMenu.pid,
                todoContextMenu.sourceWeekKey,
                todoContextMenu.sourceDay,
                todoContextMenu.todoId
              );
              setTodoContextMenu(null);
            }}
          >
            添加子任务
          </button>
          <button
            className="todo-context-menu-item"
            onClick={() => {
              const todo = getTodoByLocation(
                todoContextMenu.sourceWeekKey,
                todoContextMenu.pid,
                todoContextMenu.sourceDay,
                todoContextMenu.todoId
              );
              if (todo) {
                beginParentLink(todo.id, todo.text);
              }
              setTodoContextMenu(null);
            }}
          >
            关联前序任务
          </button>
          <button
            className="todo-context-menu-item"
            onClick={() =>
              moveTodoToRelativeWeek(
                todoContextMenu.pid,
                todoContextMenu.sourceWeekKey,
                todoContextMenu.sourceDay,
                todoContextMenu.displayDay,
                todoContextMenu.todoId,
                -1
              )
            }
          >
            移到上周
          </button>
          <button
            className="todo-context-menu-item"
            onClick={() =>
              moveTodoToRelativeWeek(
                todoContextMenu.pid,
                todoContextMenu.sourceWeekKey,
                todoContextMenu.sourceDay,
                todoContextMenu.displayDay,
                todoContextMenu.todoId,
                1
              )
            }
          >
            移到下周
          </button>
          <button
            className="todo-context-menu-item danger"
            onClick={() => {
              deleteTodo(
                todoContextMenu.pid,
                todoContextMenu.sourceWeekKey,
                todoContextMenu.sourceDay,
                todoContextMenu.todoId
              );
              setTodoContextMenu(null);
            }}
          >
            删除待办
          </button>
        </div>
      )}

      {toast && <div className="toast show">{toast}</div>}

      {showProjectModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">{projectModalMode === 'rename' ? '重命名项目' : '新增项目'}</h3>
            <input 
              className="modal-input"
              autoFocus
              placeholder="项目名称..." 
              value={newProjectName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewProjectName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && !isImeComposing(e) && saveProject()}
            />
            <div className="color-grid">
              {['#6c63ff', '#ff6b6b', '#48b8cc', '#ff9f43', '#20c997', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#a78bfa'].map(c => (
                <div 
                  key={c} 
                  className={`color-swatch ${selectedColor === c ? 'active' : ''}`}
                  style={{background: c}}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={closeProjectModal}>取消</button>
              <button className="btn-save" onClick={saveProject}>{projectModalMode === 'rename' ? '保存修改' : '保存项目'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
