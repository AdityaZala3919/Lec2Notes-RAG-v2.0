/* ============================================
   RAG Notes Generator - JavaScript
   Handles UI interactions and API calls
   ============================================ */

// ==========================================
// STATE MANAGEMENT
// ==========================================

const appState = {
  // User data
  username: '',
  documentId: '',
  sessionId: '',
  
  // File data
  selectedFile: null,
  
  // Generated content
  generatedNotes: '',
  
  // Hyperparameters
  hyperparams: {
    chunkSize: 1000,
    chunkOverlap: 200,
    retrieverK: 5,
    temperature: 0.7
  }
};

// API Base URL (change this when connecting to FastAPI)
const API_BASE = 'http://localhost:8000'; // Same origin for production, or 'http://localhost:8000' for dev

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Generate a UUID (for mock session/document IDs)
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Show/hide element with animation
 */
function showElement(element, show = true) {
  if (show) {
    element.classList.add('visible');
  } else {
    element.classList.remove('visible');
  }
}

/**
 * Enable/disable card
 */
function setCardEnabled(cardId, enabled) {
  const card = document.getElementById(cardId);
  if (enabled) {
    card.classList.remove('disabled');
  } else {
    card.classList.add('disabled');
  }
}

/**
 * Show loading state on button
 */
function setButtonLoading(button, loading) {
  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

/**
 * Simulate API delay (for demo purposes)
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// SIDEBAR FUNCTIONS
// ==========================================

/**
 * Toggle collapsible sections
 */
function toggleCollapsible(button) {
  button.classList.toggle('active');
  const content = button.nextElementSibling;
  content.classList.toggle('open');
}

/**
 * Update slider value display
 */
function updateSliderValue(sliderId) {
  const slider = document.getElementById(sliderId);
  const valueDisplay = document.getElementById(sliderId + 'Value');
  valueDisplay.textContent = slider.value;
  
  // Update state
  appState.hyperparams[sliderId] = parseFloat(slider.value);
}

// ==========================================
// FILE UPLOAD FUNCTIONS
// ==========================================

/**
 * Handle drag over event
 */
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('dropZone').classList.add('dragover');
}

/**
 * Handle drag leave event
 */
function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('dropZone').classList.remove('dragover');
}

/**
 * Handle file drop
 */
function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('dropZone').classList.remove('dragover');
  
  const files = event.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

/**
 * Handle file selection via input
 */
function handleFileSelect(event) {
  const files = event.target.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

/**
 * Process selected file
 */
function handleFile(file) {
  // Validate file type
  const allowedTypes = ['application/pdf', 'text/plain', 'text/vtt', 
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
  const allowedExtensions = ['.pdf', '.txt', '.srt'];
  
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    alert('Invalid file type. Please upload PDF, TXT, VTT, SRT, DOCX, or PPTX files.');
    return;
  }
  
  // Store file
  appState.selectedFile = file;
  
  // Update UI
  const selectedFileDiv = document.getElementById('selectedFile');
  selectedFileDiv.innerHTML = `📎 <strong>${file.name}</strong> (${formatFileSize(file.size)})`;
  showElement(selectedFileDiv, true);
  
  // Validate form
  validateUploadForm();
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Validate upload form and enable/disable button
 */
function validateUploadForm() {
  const username = document.getElementById('username').value.trim();
  const hasFile = appState.selectedFile !== null;
  
  const uploadBtn = document.getElementById('uploadBtn');
  uploadBtn.disabled = !(username && hasFile);
}

// ==========================================
// API FUNCTIONS
// ==========================================

/**
 * Upload document to backend
 */
async function uploadDocument() {
  const username = document.getElementById('username').value.trim();
  const file = appState.selectedFile;
  
  if (!username || !file) {
    alert('Please enter username and select a file');
    return;
  }
  
  const uploadBtn = document.getElementById('uploadBtn');
  setButtonLoading(uploadBtn, true);
  
  try {
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('username', username);
    formData.append('file', file);
    
    // Make API call (or simulate for demo)
    let response;
    
    if (API_BASE) {
      // Real API call
      response = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: formData
      });
      
      // Check if response is ok
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check for error in response
      if (data.error) {
        throw new Error(data.error);
      }
      
      appState.documentId = data.document_id;
    } else {
      // Simulate API response
      await delay(1500);
      appState.documentId = generateUUID();
    }
    
    // Save state
    appState.username = username;
    
    // Show success message
    const successMsg = document.getElementById('uploadSuccess');
    successMsg.innerHTML = `✅ Document uploaded successfully!<br>
      <small>Document ID: ${appState.documentId}</small>`;
    showElement(successMsg, true);
    
    // Pre-fill session card fields for "Create New Session" mode
    document.getElementById('sessionUsername').value = appState.username;
    document.getElementById('sessionDocId').value = appState.documentId;
    
    // Disable upload form to prevent changes
    document.getElementById('username').disabled = true;
    document.getElementById('dropZone').style.pointerEvents = 'none';
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '✅ Uploaded';
    
  } catch (error) {
    console.error('Upload error:', error);
    const errorMsg = error.message || 'Failed to upload document. Please try again.';
    alert(`Upload failed: ${errorMsg}\n\nPlease check:\n- Backend server is running\n- File is a valid format\n- Network connection is working`);
  } finally {
    setButtonLoading(uploadBtn, false);
  }
}

/**
 * Create a new session
 */
async function createSession() {
  const createBtn = document.getElementById('createSessionBtn');
  setButtonLoading(createBtn, true);
  
  try {
    let response;
    
    if (API_BASE) {
      // Real API call
      const formData = new FormData();
      formData.append('username', appState.username);
      formData.append('document_id', appState.documentId);
      
      response = await fetch(`${API_BASE}/sessions/create`, {
        method: 'POST',
        body: formData
      });
      
      // Check if response is ok
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check for error in response
      if (data.error) {
        throw new Error(data.error);
      }
      
      appState.sessionId = data.session_id;
    } else {
      // Simulate API response
      await delay(1000);
      appState.sessionId = generateUUID();
    }
    
    // Show session ID
    const sessionDisplay = document.getElementById('sessionDisplay');
    document.getElementById('sessionIdBox').textContent = appState.sessionId;
    showElement(sessionDisplay, true);
    
    // Disable create button
    createBtn.disabled = true;
    createBtn.innerHTML = '✅ Session Created';
    
    // Enable next card
    setCardEnabled('configCard', true);
    
  } catch (error) {
    console.error('Session creation error:', error);
    alert('Failed to create session. Please try again.');
  } finally {
    setButtonLoading(createBtn, false);
  }
}

/**
 * Handle session mode change (new vs existing)
 */
function handleSessionModeChange() {
  const mode = document.querySelector('input[name="sessionMode"]:checked').value;
  const newSessionSection = document.getElementById('newSessionSection');
  const existingSessionSection = document.getElementById('existingSessionSection');
  
  if (mode === 'new') {
    newSessionSection.style.display = 'block';
    existingSessionSection.style.display = 'none';
  } else {
    newSessionSection.style.display = 'none';
    existingSessionSection.style.display = 'block';
  }
}

/**
 * Validate existing session input
 */
function validateExistingSession() {
  const sessionId = document.getElementById('existingSessionId').value.trim();
  const useBtn = document.getElementById('useSessionBtn');
  
  // Simple validation: check if it looks like a UUID
  const isValidFormat = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sessionId);
  useBtn.disabled = !isValidFormat;
}

/**
 * Use existing session ID
 */
async function useExistingSession() {
  const sessionId = document.getElementById('existingSessionId').value.trim();
  
  if (!sessionId) {
    alert('Please enter a session ID');
    return;
  }
  
  const useBtn = document.getElementById('useSessionBtn');
  setButtonLoading(useBtn, true);
  
  try {
    // For existing session, we just validate it exists in the backend
    // In a real scenario, you might want to verify the session exists
    appState.sessionId = sessionId;
    
    // Show session ID
    const sessionDisplay = document.getElementById('sessionDisplay');
    document.getElementById('sessionIdBox').textContent = appState.sessionId;
    showElement(sessionDisplay, true);
    
    // Disable both sections
    document.getElementById('existingSessionId').disabled = true;
    document.querySelectorAll('input[name="sessionMode"]').forEach(radio => radio.disabled = true);
    useBtn.disabled = true;
    useBtn.innerHTML = '✅ Session Loaded';
    
    // Enable next card
    setCardEnabled('configCard', true);
    
    // Show info message
    alert(`✅ Session loaded successfully!\n\nSession ID: ${sessionId}\n\nYou can now configure and generate notes.`);
    
  } catch (error) {
    console.error('Session loading error:', error);
    alert('Failed to load session. Please check the session ID and try again.');
  } finally {
    setButtonLoading(useBtn, false);
  }
}

/**
 * Handle format dropdown change
 */
function handleFormatChange() {
  const format = document.getElementById('notesFormat').value;
  const customPromptGroup = document.getElementById('customPromptGroup');
  
  if (format === 'type_17') {
    customPromptGroup.classList.add('visible');
  } else {
    customPromptGroup.classList.remove('visible');
  }
}

/**
 * Generate notes
 */
async function generateNotes() {
  const generateBtn = document.getElementById('generateBtn');
  const format = document.getElementById('notesFormat').value;
  const customPrompt = document.getElementById('customPrompt').value;
  
  // Validate custom prompt if needed
  if (format === 'type_17' && !customPrompt.trim()) {
    alert('Please enter a custom prompt template');
    return;
  }
  
  setButtonLoading(generateBtn, true);
  
  try {
    let notes;
    
    if (API_BASE) {
      // Step 1: Select format
      const formatData = new FormData();
      formatData.append('session_id', appState.sessionId);
      formatData.append('notes_format', format);
      if (customPrompt) {
        formatData.append('custom_format', customPrompt);
      }
      
      const formatResponse = await fetch(`${API_BASE}/formats`, {
        method: 'POST',
        body: formatData
      });
      
      // Check format selection response
      if (!formatResponse.ok) {
        throw new Error(`HTTP error! status: ${formatResponse.status}`);
      }
      
      const formatResult = await formatResponse.json();
      if (formatResult.error) {
        throw new Error(formatResult.error);
      }
      
      // Step 2: Generate notes
      const notesData = new FormData();
      notesData.append('session_id', appState.sessionId);
      
      const response = await fetch(`${API_BASE}/generate-notes`, {
        method: 'POST',
        body: notesData
      });
      
      // Check notes generation response
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check for error in response
      if (data.error) {
        throw new Error(data.error);
      }
      
      notes = data.notes;
    } else {
      // Simulate API response
      await delay(2500);
      notes = generateMockNotes(format);
    }
    
    // Store notes
    appState.generatedNotes = notes;
    
    // Render notes
    const notesOutput = document.getElementById('notesOutput');
    notesOutput.classList.add('has-content');
    notesOutput.innerHTML = marked.parse(notes);
    
    // Show action buttons
    const outputActions = document.getElementById('outputActions');
    showElement(outputActions, true);
    
    // Scroll to output
    document.getElementById('outputCard').scrollIntoView({ behavior: 'smooth' });
    
  } catch (error) {
    console.error('Generation error:', error);
    const errorMsg = error.message || 'Failed to generate notes. Please try again.';
    alert(`Generation failed: ${errorMsg}\n\nDebug info:\n- Session ID: ${appState.sessionId}\n- Format: ${format}\n- Check console for details`);
  } finally {
    setButtonLoading(generateBtn, false);
  }
}

/**
 * Generate mock notes for demo
 */
function generateMockNotes(format) {
  const formatTitles = {
    'type_1': 'Detailed Structured Study Notes',
    'type_2': 'Conceptual Mind Map',
    'type_3': 'Step-by-Step Explanation',
    'type_6': 'Flashcard Style',
    'type_10': 'Exam-Ready Highlights'
  };
  
  const title = formatTitles[format] || 'Generated Notes';
  
  return `# ${title}

## Overview
This document contains AI-generated notes from your uploaded transcript. The notes have been structured to maximize learning efficiency and retention.

## Key Concepts

### 1. Introduction to the Topic
The main subject covered in this lecture introduces fundamental concepts that form the foundation of the field.

- **Definition**: Core terminology and basic definitions
- **Historical Context**: How the field evolved over time
- **Modern Applications**: Current real-world uses

### 2. Core Principles
Understanding these principles is essential for mastering the subject matter.

> "The key to understanding complex topics is breaking them down into manageable components." - Course Instructor

#### 2.1 First Principle
Explanation of the first core principle with examples.

#### 2.2 Second Principle
Detailed breakdown of the second principle.

### 3. Practical Examples

| Concept | Example | Application |
|---------|---------|-------------|
| Concept A | Example 1 | Real-world use case |
| Concept B | Example 2 | Industry application |
| Concept C | Example 3 | Research context |

### 4. Key Takeaways
- Main point to remember from this lecture
- Important formula or concept
- Critical relationship between ideas

## Summary
These notes provide a comprehensive overview of the lecture content, organized for effective study and review.

---
*Generated using RAG Notes Generator*`;
}

/**
 * Download notes as PDF
 */
async function downloadPdf() {
  if (!appState.generatedNotes) {
    alert('No notes to download');
    return;
  }
  
  try {
    if (API_BASE) {
      // Real API call
      const formData = new FormData();
      formData.append('pdfname', 'lecture-notes');
      
      const response = await fetch(`${API_BASE}/download/pdf`, {
        method: 'POST',
        body: formData
      });
      
      // Check response
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      downloadBlob(blob, 'lecture-notes.pdf');
    } else {
      // Simulate download
      alert('📄 PDF download would start here.\nConnect to the FastAPI backend to enable actual downloads.');
    }
  } catch (error) {
    console.error('Download error:', error);
    alert('Failed to download PDF');
  }
}

/**
 * Download notes as Markdown
 */
async function downloadMarkdown() {
  if (!appState.generatedNotes) {
    alert('No notes to download');
    return;
  }
  
  try {
    if (API_BASE) {
      // Real API call
      const formData = new FormData();
      formData.append('mdname', 'lecture-notes');
      
      const response = await fetch(`${API_BASE}/download/markdown`, {
        method: 'POST',
        body: formData
      });
      
      // Check response
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      downloadBlob(blob, 'lecture-notes.md');
    } else {
      // Create and download markdown file
      const blob = new Blob([appState.generatedNotes], { type: 'text/markdown' });
      downloadBlob(blob, 'lecture-notes.md');
    }
  } catch (error) {
    console.error('Download error:', error);
    alert('Failed to download Markdown');
  }
}

/**
 * Helper to trigger file download
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// CHAT FUNCTIONS
// ==========================================

/**
 * Toggle chat section visibility
 */
function toggleChat() {
  const chatContainer = document.getElementById('chatContainer');
  const chatChevron = document.getElementById('chatChevron');
  
  chatContainer.classList.toggle('open');
  
  if (chatContainer.classList.contains('open')) {
    chatChevron.style.transform = 'rotate(180deg)';
  } else {
    chatChevron.style.transform = 'rotate(0deg)';
  }
}

/**
 * Handle Enter key in chat input
 */
function handleChatKeypress(event) {
  if (event.key === 'Enter') {
    sendChatMessage();
  }
}

/**
 * Send chat message
 */
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  if (!appState.sessionId) {
    alert('Please create a session first');
    return;
  }
  
  // Clear input
  input.value = '';
  
  // Add user message to chat
  addChatMessage(message, 'user');
  
  try {
    let answer;
    
    if (API_BASE) {
      // Real API call
      const formData = new FormData();
      formData.append('session_id', appState.sessionId);
      formData.append('question', message);
      
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        body: formData
      });
      
      // Check response
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check for error in response
      if (data.error) {
        throw new Error(data.error);
      }
      
      answer = data.answer;
    } else {
      // Simulate response
      await delay(1500);
      answer = generateMockChatResponse(message);
    }
    
    // Add assistant message
    addChatMessage(answer, 'assistant');
    
  } catch (error) {
    console.error('Chat error:', error);
    addChatMessage('Sorry, I encountered an error. Please try again.', 'assistant');
  }
}

/**
 * Add message to chat history
 */
function addChatMessage(content, role) {
  const chatHistory = document.getElementById('chatHistory');
  
  // Remove welcome message if present
  const welcome = chatHistory.querySelector('.chat-welcome');
  if (welcome) {
    welcome.remove();
  }
  
  // Create message element
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  if (role === 'assistant') {
    contentDiv.innerHTML = marked.parse(content);
  } else {
    contentDiv.textContent = content;
  }
  
  messageDiv.appendChild(contentDiv);
  chatHistory.appendChild(messageDiv);
  
  // Scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * Generate mock chat response
 */
function generateMockChatResponse(question) {
  const responses = [
    "Based on the lecture content, this concept refers to the fundamental principles discussed in section 2. The key point is understanding how these elements interact with each other.",
    "Great question! The transcript mentions this topic in the context of practical applications. It's important to note that there are multiple approaches to solving this problem.",
    "According to the lecture, this relates to the core framework introduced earlier. The instructor emphasized the importance of understanding the underlying theory before applying it.",
    "The document discusses this in detail. In summary, there are three main aspects to consider: the theoretical foundation, practical implementation, and real-world implications.",
    "This is covered in the section on key concepts. The main takeaway is that understanding this principle helps in grasping more advanced topics later in the course."
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// ==========================================
// INITIALIZATION
// ==========================================

/**
 * Initialize the application
 */
function init() {
  console.log('🚀 RAG Notes Generator initialized');
  
  // Ensure cards are in correct initial state
  // Session card is now always enabled (user can use existing session ID)
  setCardEnabled('configCard', false);
  
  // Hide output actions initially
  showElement(document.getElementById('outputActions'), false);
  
  // Initialize slider values
  updateSliderValue('chunkSize');
  updateSliderValue('chunkOverlap');
  updateSliderValue('retrieverK');
  updateSliderValue('temperature');
}

// Run initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);
