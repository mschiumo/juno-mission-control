'use client';

import { useState, useEffect } from 'react';
import { FolderGit2, GitBranch, Clock, MoreHorizontal, Calendar, AlertCircle, Flag, X, Edit2, Save, ExternalLink, Plus, Trash2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'paused' | 'planning';
  priority: 'high' | 'medium' | 'low';
  progress: number;
  lastUpdated: string;
  dueDate?: string;
  repo?: string;
  tasks: { total: number; completed: number };
  timeTracked?: number;
}

const initialProjects: Project[] = [
  {
    id: '1',
    name: 'Juno Dashboard',
    description: 'Mission control dashboard rebuild',
    status: 'active',
    priority: 'high',
    progress: 75,
    lastUpdated: '2024-01-15T10:30:00Z',
    dueDate: '2026-02-13',
    repo: 'github.com/mschiumo/juno-mission-control',
    tasks: { total: 12, completed: 9 },
    timeTracked: 45
  },
  {
    id: '2',
    name: 'KeepLiving Shopify',
    description: 'Ecommerce store for mental health merchandise',
    status: 'active',
    priority: 'high',
    progress: 30,
    lastUpdated: '2024-02-14T08:00:00Z',
    dueDate: '2024-03-15',
    tasks: { total: 20, completed: 6 },
    timeTracked: 12
  },
  {
    id: '3',
    name: 'Trading Journal',
    description: 'Automated trading journal and analytics',
    status: 'planning',
    priority: 'medium',
    progress: 10,
    lastUpdated: '2024-02-10T09:00:00Z',
    dueDate: '2024-04-01',
    tasks: { total: 15, completed: 1 },
    timeTracked: 3
  },
  {
    id: '4',
    name: 'Content Calendar',
    description: 'Social media content planning system',
    status: 'paused',
    priority: 'low',
    progress: 40,
    lastUpdated: '2024-01-20T14:20:00Z',
    tasks: { total: 10, completed: 4 }
  }
];

export default function ProjectsCard() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  
  // Force re-render every minute to update overdue labels dynamically
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#238636] text-[#238636]';
      case 'completed':
        return 'bg-[#8b949e] text-[#8b949e]';
      case 'paused':
        return 'bg-[#d29922] text-[#d29922]';
      default:
        return 'bg-[#58a6ff] text-[#58a6ff]';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-[#da3633] bg-[#da3633]/10 border-[#da3633]/30';
      case 'medium':
        return 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/30';
      case 'low':
        return 'text-[#8b949e] bg-[#8b949e]/10 border-[#8b949e]/30';
      default:
        return 'text-[#8b949e] bg-[#8b949e]/10 border-[#8b949e]/30';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertCircle className="w-3 h-3" />;
      case 'medium':
        return <Flag className="w-3 h-3" />;
      case 'low':
        return <Flag className="w-3 h-3 opacity-50" />;
      default:
        return null;
    }
  };

  const formatLastUpdated = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  const getDaysUntilDue = (dueDate?: string) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const getCountdownColor = (days: number) => {
    if (days < 0) return 'text-[#da3633]';
    if (days <= 7) return 'text-[#d29922]';
    return 'text-[#238636]';
  };

  const openEditModal = (project: Project) => {
    setEditingProject({ ...project });
    setIsModalOpen(true);
  };

  const closeEditModal = () => {
    setEditingProject(null);
    setErrors({});
    setIsModalOpen(false);
  };

  const validateProject = (project: Project): {[key: string]: string} => {
    const newErrors: {[key: string]: string} = {};
    
    if (!project.name || project.name.trim() === '') {
      newErrors.name = 'Title is required';
    } else if (project.name.trim().length < 2) {
      newErrors.name = 'Title must be at least 2 characters';
    } else if (project.name.trim().length > 100) {
      newErrors.name = 'Title must be less than 100 characters';
    }
    
    if (project.description && project.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }
    
    if (project.dueDate) {
      const dueDate = new Date(project.dueDate);
      if (isNaN(dueDate.getTime())) {
        newErrors.dueDate = 'Invalid date';
      }
    }
    
    return newErrors;
  };

  const handleSave = () => {
    if (!editingProject) return;
    
    const validationErrors = validateProject(editingProject);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    const isNew = !projects.some(p => p.id === editingProject.id);
    
    if (isNew) {
      // Create new project
      setProjects(prev => [...prev, { ...editingProject, lastUpdated: new Date().toISOString() }]);
    } else {
      // Update existing project
      setProjects(prev => prev.map(p => 
        p.id === editingProject.id 
          ? { ...editingProject, lastUpdated: new Date().toISOString() }
          : p
      ));
    }
    closeEditModal();
  };

  const handleDelete = (project: Project) => {
    setProjectToDelete(project);
  };

  const confirmDelete = () => {
    if (!projectToDelete) return;
    setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
    setProjectToDelete(null);
    if (expandedProject === projectToDelete.id) {
      setExpandedProject(null);
    }
  };

  const cancelDelete = () => {
    setProjectToDelete(null);
  };

  const openCreateModal = () => {
    const newProject: Project = {
      id: Date.now().toString(),
      name: '',
      description: '',
      status: 'planning',
      priority: 'medium',
      progress: 0,
      lastUpdated: new Date().toISOString(),
      tasks: { total: 0, completed: 0 }
    };
    setEditingProject(newProject);
    setIsModalOpen(true);
  };

  const isNewProject = () => {
    return editingProject ? !projects.some(p => p.id === editingProject.id) : false;
  };

  const handleChange = (field: keyof Project, value: string | number) => {
    if (!editingProject) return;
    setEditingProject({ ...editingProject, [field]: value });
  };

  // Sort by priority (high → medium → low) then by due date
  const sortedProjects = [...projects].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return 0;
  });

  return (
    <>
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
              <FolderGit2 className="w-5 h-5 text-[#ff6b35]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Projects</h2>
              <p className="text-xs text-[#8b949e]">Sorted by priority & due date</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#8b949e]">{projects.filter(p => p.status === 'active').length} active</span>
            <button
              onClick={openCreateModal}
              className="p-1.5 bg-[#ff6b35] hover:bg-[#ff8c5a] text-white rounded-lg transition-colors"
              title="Add new project"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {sortedProjects.map((project) => {
            const daysUntilDue = getDaysUntilDue(project.dueDate);
            return (
              <div 
                key={project.id}
                className="bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden"
              >
                <div 
                  className="p-3 hover:bg-[#21262d] transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full ${getStatusColor(project.status).split(' ')[0]}`}></span>
                        <span className="font-medium text-white truncate">{project.name}</span>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(project.priority)}`}>
                          {getPriorityIcon(project.priority)}
                          {project.priority.charAt(0).toUpperCase() + project.priority.slice(1)}
                        </span>
                      </div>
                      <div className="text-xs text-[#8b949e] mt-1">{project.description}</div>
                      
                      {daysUntilDue !== null && (
                        <div className={`text-xs mt-1 font-medium ${getCountdownColor(daysUntilDue)}`}>
                          {daysUntilDue < 0 
                            ? `⚠️ Overdue by ${Math.abs(daysUntilDue)} days`
                            : daysUntilDue === 0 
                              ? '📅 Due today!'
                              : daysUntilDue === 1
                                ? '📅 Due tomorrow'
                                : `📅 ${daysUntilDue} days until due`
                          }
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(project)}
                        className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors"
                        title="Edit project"
                      >
                        <Edit2 className="w-4 h-4 text-[#8b949e] hover:text-[#ff6b35]" />
                      </button>
                      <button
                        onClick={() => handleDelete(project)}
                        className="p-1.5 hover:bg-[#da3633]/20 rounded-lg transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4 text-[#8b949e] hover:text-[#da3633]" />
                      </button>
                      <span className={`text-xs font-medium uppercase ${getStatusColor(project.status).split(' ')[1]}`}>
                        {project.status}
                      </span>
                      <MoreHorizontal className="w-4 h-4 text-[#8b949e]" />
                    </div>
                  </div>

                  <div className="mt-3 cursor-pointer" onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}>
                    <div className="flex items-center justify-between text-xs text-[#8b949e] mb-1">
                      <span>Progress</span>
                      <span>{project.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] rounded-full transition-all duration-500"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {expandedProject === project.id && (
                  <div className="px-3 pb-3 border-t border-[#30363d] pt-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-[#8b949e]">
                        <GitBranch className="w-4 h-4" />
                        <span>{project.tasks.completed}/{project.tasks.total} tasks</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#8b949e]">
                        <Clock className="w-4 h-4" />
                        <span>Updated {formatLastUpdated(project.lastUpdated)}</span>
                      </div>
                      {project.dueDate && (
                        <div className="flex items-center gap-2 text-[#8b949e]">
                          <Calendar className="w-4 h-4" />
                          <span>Due: {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      )}
                      {project.timeTracked && (
                        <div className="flex items-center gap-2 text-[#8b949e]">
                          <Clock className="w-4 h-4" />
                          <span>{project.timeTracked}h tracked</span>
                        </div>
                      )}
                    </div>
                    {project.repo && (
                      <a 
                        href={`https://${project.repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 text-xs text-[#ff6b35] hover:underline flex items-center gap-1"
                      >
                        {project.repo}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {isModalOpen && editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
              <h3 className="text-lg font-semibold text-white">
                {isNewProject() ? 'Create Project' : 'Edit Project'}
              </h3>
              <button
                onClick={closeEditModal}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-1">
                  Title <span className="text-[#da3633]">*</span>
                </label>
                <input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => {
                    handleChange('name', e.target.value);
                    if (errors.name) {
                      setErrors(prev => ({ ...prev, name: '' }));
                    }
                  }}
                  className={`w-full px-3 py-2 bg-[#0d1117] border rounded-lg text-white focus:outline-none focus:border-[#ff6b35] ${
                    errors.name ? 'border-[#da3633]' : 'border-[#30363d]'
                  }`}
                  placeholder="Project name"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-[#da3633]">{errors.name}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-1">Description</label>
                <textarea
                  value={editingProject.description}
                  onChange={(e) => {
                    handleChange('description', e.target.value);
                    if (errors.description) {
                      setErrors(prev => ({ ...prev, description: '' }));
                    }
                  }}
                  rows={2}
                  className={`w-full px-3 py-2 bg-[#0d1117] border rounded-lg text-white focus:outline-none focus:border-[#ff6b35] resize-none ${
                    errors.description ? 'border-[#da3633]' : 'border-[#30363d]'
                  }`}
                  placeholder="Brief description"
                />
                {errors.description && (
                  <p className="mt-1 text-xs text-[#da3633]">{errors.description}</p>
                )}
              </div>

              {/* Status & Priority Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#8b949e] mb-1">Status</label>
                  <select
                    value={editingProject.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35]"
                  >
                    <option value="active">Active</option>
                    <option value="planning">Planning</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#8b949e] mb-1">Priority</label>
                  <select
                    value={editingProject.priority}
                    onChange={(e) => handleChange('priority', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35]"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-1">Due Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={editingProject.dueDate || ''}
                    onChange={(e) => handleChange('dueDate', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35] [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e] pointer-events-none" />
                </div>
              </div>

              {/* Progress */}
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-1">
                  Progress: {editingProject.progress}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={editingProject.progress}
                  onChange={(e) => handleChange('progress', parseInt(e.target.value))}
                  className="w-full h-2 bg-[#30363d] rounded-lg appearance-none cursor-pointer accent-[#ff6b35]"
                />
                <div className="h-1.5 bg-[#30363d] rounded-full overflow-hidden mt-2">
                  <div 
                    className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] rounded-full transition-all duration-300"
                    style={{ width: `${editingProject.progress}%` }}
                  />
                </div>
              </div>

              {/* Repository */}
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-1">Repository (optional)</label>
                <input
                  type="text"
                  value={editingProject.repo || ''}
                  onChange={(e) => handleChange('repo', e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35]"
                  placeholder="github.com/username/repo"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-[#30363d]">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-sm text-[#8b949e] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-[#ff6b35] hover:bg-[#ff8c5a] text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-[#30363d]">
              <h3 className="text-lg font-semibold text-white">Delete Project</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-[#8b949e]">
                Are you sure you want to delete <span className="text-white font-medium">"{projectToDelete.name}"</span>?
                This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-[#30363d]">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-sm text-[#8b949e] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex items-center gap-2 px-4 py-2 bg-[#da3633] hover:bg-[#f85149] text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
