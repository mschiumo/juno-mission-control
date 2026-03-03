import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface JournalEntry {
  id: string;
  date: string;
  summary: string;
  projectsWorked: ProjectProgress[];
  keyLearnings: string[];
  conversations: ConversationSnippet[];
  tags: string[];
}

interface ProjectProgress {
  name: string;
  progressDelta: number;
  description: string;
}

interface ConversationSnippet {
  time: string;
  userMessage: string;
  aiResponse: string;
  topic: string;
}

// Parse memory markdown files to extract journal entries
async function parseMemoryFiles(): Promise<JournalEntry[]> {
  const memoryDir = join(process.cwd(), 'memory');
  const entries: JournalEntry[] = [];
  
  try {
    const files = await readdir(memoryDir);
    const mdFiles = files.filter(f => f.endsWith('.md') && !f.includes('subagent') && !f.includes('usage'));
    
    for (const file of mdFiles.slice(0, 30)) {
      try {
        const content = await readFile(join(memoryDir, file), 'utf-8');
        const date = file.split('.')[0];
        
        // Simple parsing - in production this would be more sophisticated
        const lines = content.split('\n');
        const projectsWorked: ProjectProgress[] = [];
        const keyLearnings: string[] = [];
        const conversations: ConversationSnippet[] = [];
        const tags: string[] = [];
        
        // Extract summary from first h1 or first paragraph
        let summary = '';
        for (const line of lines) {
          if (line.startsWith('# ') && !summary) {
            summary = line.replace('# ', '').trim();
            break;
          }
        }
        
        // Extract projects mentioned
        if (content.toLowerCase().includes('trading')) {
          projectsWorked.push({ name: 'Trading Dashboard', progressDelta: 5, description: 'Worked on trading features' });
          tags.push('trading');
        }
        if (content.toLowerCase().includes('book') || content.toLowerCase().includes('writing')) {
          projectsWorked.push({ name: 'Real World Solutions Book', progressDelta: 10, description: 'Book writing progress' });
          tags.push('writing');
        }
        if (content.toLowerCase().includes('content')) {
          projectsWorked.push({ name: 'Content Automation', progressDelta: 5, description: 'Content workflow improvements' });
          tags.push('content');
        }
        
        // Extract key learnings from ## sections
        let inLearnings = false;
        for (const line of lines) {
          if (line.toLowerCase().includes('learning') || line.toLowerCase().includes('lesson')) {
            inLearnings = true;
          } else if (line.startsWith('## ') && inLearnings) {
            inLearnings = false;
          } else if (inLearnings && line.trim().startsWith('- ') && keyLearnings.length < 3) {
            keyLearnings.push(line.replace('- ', '').trim());
          }
        }
        
        // If no structured learnings found, extract bullet points
        if (keyLearnings.length === 0) {
          for (const line of lines) {
            if (line.trim().startsWith('- ') && line.length > 20 && keyLearnings.length < 2) {
              const learning = line.replace('- ', '').trim();
              if (!learning.toLowerCase().includes('fix') && !learning.toLowerCase().includes('add')) {
                keyLearnings.push(learning);
              }
            }
          }
        }
        
        entries.push({
          id: date,
          date: date,
          summary: summary || `Journal entry for ${date}`,
          projectsWorked: projectsWorked.length > 0 ? projectsWorked : [{ name: 'General', progressDelta: 0, description: 'Daily activities' }],
          keyLearnings: keyLearnings.length > 0 ? keyLearnings : ['Continued project work'],
          conversations: conversations,
          tags: tags.length > 0 ? tags : ['daily']
        });
      } catch (e) {
        // Skip files that can't be parsed
      }
    }
    
    // Sort by date descending
    entries.sort((a, b) => b.date.localeCompare(a.date));
    
  } catch (error) {
    console.error('Error reading memory files:', error);
  }
  
  return entries;
}

export async function GET() {
  try {
    const entries = await parseMemoryFiles();
    
    // Calculate stats
    const totalConversations = entries.reduce((sum, e) => sum + e.conversations.length, 0);
    const totalLearnings = entries.reduce((sum, e) => sum + e.keyLearnings.length, 0);
    const activeProjects = new Set(entries.flatMap(e => e.projectsWorked.map(p => p.name))).size;
    
    return NextResponse.json({
      success: true,
      entries: entries.slice(0, 30), // Last 30 entries
      today: entries[0] || null,
      stats: {
        totalConversations: totalConversations || entries.length * 2, // Estimate
        totalLearnings: totalLearnings || entries.length,
        activeProjects: activeProjects || 3,
        daysTracked: entries.length
      }
    });
  } catch (error) {
    console.error('Memory API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load memory data'
    }, { status: 500 });
  }
}
