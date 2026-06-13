/* ==========================================================================
   AetherEdit Core Application Controller (Simplified curved VS Code Style)
   ========================================================================== */

// 1. Core State
let files = {};
let openTabs = [];
let activeFilePath = null;
let dirtyFiles = new Set();
let expandedFolders = new Set();

let settings = {
  theme: 'theme-vscode-dark',
  fontSize: 14,
  tabSize: 2,
  autoSave: true,
  minimap: true,
  wordWrap: true
};

let editorInstance = null;
let editorModels = {};
let saveTimeouts = {};
let contextMenuTarget = null;

// Initial Workspace Template
const DEFAULT_WORKSPACE = {};


function loadFromStorage() {
  let storedFiles = localStorage.getItem('vscode_notepad_files');
  const storedSettings = localStorage.getItem('vscode_notepad_settings');
  
  if (storedFiles) {
    try {
      const parsed = JSON.parse(storedFiles);
      const keys = Object.keys(parsed);
      const oldKeys = ["/index.html", "/css", "/css/style.css", "/js", "/js/script.js", "/README.md"];
      if (keys.length === oldKeys.length && oldKeys.every(k => keys.includes(k))) {
        localStorage.removeItem('vscode_notepad_files');
        storedFiles = null;
      }
    } catch(e) {}
  }

  if (storedFiles) {
    files = JSON.parse(storedFiles);
  } else {
    files = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE));
    saveToStorage();
  }

  if (storedSettings) {
    settings = { ...settings, ...JSON.parse(storedSettings) };
  }
}

function saveToStorage() {
  localStorage.setItem('vscode_notepad_files', JSON.stringify(files));
}

function saveSettingsToStorage() {
  localStorage.setItem('vscode_notepad_settings', JSON.stringify(settings));
}

// 3. Drag Handles Resizing
function initLayoutResizers() {
  const sidebar = document.getElementById('sidebar');
  const sidebarResizer = document.getElementById('sidebar-resizer');
  
  let isDraggingSidebar = false;

  sidebarResizer.addEventListener('mousedown', (e) => {
    isDraggingSidebar = true;
    sidebarResizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (isDraggingSidebar) {
      // Offset by activity bar width (48px) + workspace padding (8px)
      const newWidth = Math.max(150, Math.min(450, e.clientX - 56));
      sidebar.style.width = `${newWidth}px`;
      if (editorInstance) editorInstance.layout();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDraggingSidebar) {
      isDraggingSidebar = false;
      sidebarResizer.classList.remove('dragging');
      document.body.style.cursor = 'default';
      if (editorInstance) editorInstance.layout();
    }
  });

  window.addEventListener('resize', () => {
    if (editorInstance) editorInstance.layout();
  });
}

// 4. File Tree Navigation
function buildTreeFromPaths(files) {
  const root = { name: "Root", children: {}, type: "folder", path: "" };
  for (const [path, info] of Object.entries(files)) {
    const parts = path.split('/').filter(Boolean);
    let current = root;
    let accumulatedPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulatedPath += "/" + part;
      const isLast = (i === parts.length - 1);
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          children: {},
          type: (isLast && !info.isFolder) ? "file" : "folder",
          path: accumulatedPath
        };
      }
      current = current.children[part];
    }
  }
  return root;
}

function renderFileTree() {
  const container = document.getElementById('file-tree');
  container.innerHTML = '';
  
  const searchInput = document.getElementById('search-files');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  let filteredFiles = { ...files };
  if (query) {
    filteredFiles = {};
    for (const [path, info] of Object.entries(files)) {
      const filename = path.split('/').pop().toLowerCase();
      if (filename.includes(query)) {
        filteredFiles[path] = info;
        const parts = path.split('/').filter(Boolean);
        let currPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currPath += '/' + parts[i];
          filteredFiles[currPath] = { isFolder: true };
          expandedFolders.add(currPath);
        }
      }
    }
  }

  const treeData = buildTreeFromPaths(filteredFiles);
  renderTreeNodes(treeData, container, 0);
  lucide.createIcons();
}

function renderTreeNodes(node, container, depth = 0) {
  const sortedKeys = Object.keys(node.children).sort((a, b) => {
    const childA = node.children[a];
    const childB = node.children[b];
    if (childA.type !== childB.type) {
      return childA.type === 'folder' ? -1 : 1;
    }
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const child = node.children[key];
    const li = document.createElement('li');
    li.className = 'tree-node';
    if (child.type === 'folder' && expandedFolders.has(child.path)) {
      li.classList.add('expanded');
    }
    
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.path = child.path;
    row.dataset.type = child.type;
    
    if (child.type === 'file') {
      const ext = child.name.split('.').pop().toLowerCase();
      row.dataset.ext = ext;
    }
    if (activeFilePath === child.path) {
      row.classList.add('active');
    }

    // Indent
    for (let i = 0; i < depth; i++) {
      const indent = document.createElement('span');
      indent.className = 'tree-indent';
      row.appendChild(indent);
    }

    // Tree Arrow
    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    if (child.type === 'folder') {
      arrow.innerHTML = '<i data-lucide="chevron-right"></i>';
    }
    row.appendChild(arrow);

    // Icon
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    if (child.type === 'folder') {
      icon.innerHTML = expandedFolders.has(child.path) 
        ? '<i data-lucide="folder-open"></i>' 
        : '<i data-lucide="folder"></i>';
    } else {
      const ext = child.name.split('.').pop().toLowerCase();
      let iconType = 'file-text';
      if (ext === 'html' || ext === 'htm') iconType = 'file-code';
      else if (ext === 'css') iconType = 'braces';
      else if (ext === 'js' || ext === 'javascript') iconType = 'file-json';
      else if (ext === 'md' || ext === 'markdown') iconType = 'book-open';
      else if (ext === 'json') iconType = 'file-output';
      icon.innerHTML = `<i data-lucide="${iconType}"></i>`;
    }
    row.appendChild(icon);

    // Label
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = child.name;
    row.appendChild(label);

    li.appendChild(row);

    if (child.type === 'folder') {
      const ul = document.createElement('ul');
      ul.className = 'tree-branch';
      ul.style.listStyle = 'none';
      ul.style.display = expandedFolders.has(child.path) ? 'block' : 'none';
      renderTreeNodes(child, ul, depth + 1);
      li.appendChild(ul);
    }

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (child.type === 'folder') {
        if (expandedFolders.has(child.path)) {
          expandedFolders.delete(child.path);
        } else {
          expandedFolders.add(child.path);
        }
        renderFileTree();
      } else {
        openFile(child.path);
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.pageX, e.pageY, child.path, child.type);
    });

    container.appendChild(li);
  }
}

// 5. Context Menu Logic
function showContextMenu(x, y, path, type) {
  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  contextMenuTarget = { path, type };
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
  contextMenuTarget = null;
}

document.addEventListener('click', hideContextMenu);

// 6. Monaco Editor Initialization & Themes
function initMonaco() {
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' } });
  
  require(['vs/editor/editor.main'], function () {
    registerCustomMonacoThemes();
    
    const placeholder = document.getElementById('editor-placeholder');
    const container = document.getElementById('editor-container');
    
    editorInstance = monaco.editor.create(container, {
      automaticLayout: true,
      fontSize: settings.fontSize,
      fontFamily: "'JetBrains Mono', monospace",
      tabSize: parseInt(settings.tabSize),
      minimap: { enabled: settings.minimap },
      wordWrap: settings.wordWrap ? "on" : "off",
      cursorBlinking: "blink",
      cursorSmoothCaretAnimation: "off",
      padding: { top: 4 }
    });

    editorInstance.onDidChangeCursorPosition((e) => {
      document.getElementById('status-stats').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    updateActiveTheme(settings.theme);
    
    if (activeFilePath) {
      placeholder.style.display = 'none';
    } else {
      placeholder.style.display = 'flex';
    }

    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeFilePath) {
        saveFile(activeFilePath, editorInstance.getValue());
        downloadFile(activeFilePath.split('/').pop(), editorInstance.getValue());
      }
    });

    const startupFile = files['/index.html'] ? '/index.html' : Object.keys(files).filter(k => !files[k].isFolder)[0];
    if (startupFile) {
      openFile(startupFile);
    }
    
    renderFileTree();
  });
}

function registerCustomMonacoThemes() {
  // VS Code Dark+
  monaco.editor.defineTheme('vscode-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569cd6' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'regexp', foreground: 'd16969' },
      { token: 'type', foreground: '4ec9b0' }
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#cccccc',
      'editor.lineHighlightBackground': '#2d2d2d',
      'editorCursor.foreground': '#aeafad',
      'editorIndentGuide.activeBackground': '#404040',
      'editor.selectionBackground': '#264f78'
    }
  });

  // VS Code Light+
  monaco.editor.defineTheme('vscode-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'keyword', foreground: '0000ff' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' }
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editorCursor.foreground': '#000000',
      'editor.lineHighlightBackground': '#f2f2f2',
      'editor.selectionBackground': '#add6ff'
    }
  });

  // Dracula
  monaco.editor.defineTheme('dracula', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'identifier', foreground: 'f8f8f2' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd' }
    ],
    colors: {
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#44475a22',
      'editorCursor.foreground': '#ff79c6',
      'editor.selectionBackground': '#44475a88'
    }
  });

  // One Dark
  monaco.editor.defineTheme('onedark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'identifier', foreground: 'abb2bf' },
      { token: 'string', foreground: '98c379' },
      { token: 'number', foreground: 'd19a66' }
    ],
    colors: {
      'editor.background': '#282c34',
      'editor.foreground': '#abb2bf',
      'editor.lineHighlightBackground': '#2c313c88',
      'editorCursor.foreground': '#61afef',
      'editor.selectionBackground': '#3e4451aa'
    }
  });
}

function getOrCreateModel(path, content) {
  if (editorModels[path]) return editorModels[path];
  
  const ext = path.split('.').pop().toLowerCase();
  let language = 'plaintext';
  if (ext === 'html' || ext === 'htm') language = 'html';
  else if (ext === 'css') language = 'css';
  else if (ext === 'js' || ext === 'javascript') language = 'javascript';
  else if (ext === 'json') language = 'json';
  else if (ext === 'md' || ext === 'markdown') language = 'markdown';

  const uri = monaco.Uri.file(path);
  const model = monaco.editor.createModel(content, language, uri);
  
  model.onDidChangeContent(() => {
    markFileAsDirty(path);
    if (settings.autoSave) {
      debouncedSave(path, model.getValue());
    }
  });

  editorModels[path] = model;
  return model;
}

// 7. Save & Autosave logic
function markFileAsDirty(path) {
  if (!dirtyFiles.has(path)) {
    dirtyFiles.add(path);
    updateTabsUI();
  }
}

function debouncedSave(path, content) {
  if (saveTimeouts[path]) clearTimeout(saveTimeouts[path]);
  
  const autoIndicator = document.getElementById('status-autosave-indicator');
  autoIndicator.textContent = 'Autosaving...';

  saveTimeouts[path] = setTimeout(() => {
    saveFile(path, content);
  }, 1000);
}

function saveFile(path, content) {
  if (saveTimeouts[path]) clearTimeout(saveTimeouts[path]);
  
  if (files[path]) {
    files[path].content = content;
    saveToStorage();
    dirtyFiles.delete(path);
    updateTabsUI();
    
    document.getElementById('status-autosave-indicator').textContent = `Spaces: ${settings.tabSize}`;
  }
}

// 8. Tab management & Breadcrumbs Update
function openFile(path) {
  if (files[path].isFolder) return;

  activeFilePath = path;
  
  if (!openTabs.includes(path)) {
    openTabs.push(path);
  }

  document.getElementById('editor-placeholder').style.display = 'none';

  if (editorInstance) {
    const model = getOrCreateModel(path, files[path].content);
    editorInstance.setModel(model);
    editorInstance.focus();
  }

  updateTabsUI();
  updateBreadcrumbs(path);
  updateStatusBarInfo(path);
  renderFileTree();
}

function closeTab(path, event) {
  if (event) event.stopPropagation();

  if (dirtyFiles.has(path)) {
    const confirmClose = confirm(`File "${path.split('/').pop()}" has unsaved changes. Close anyway?`);
    if (!confirmClose) return;
  }

  openTabs = openTabs.filter(t => t !== path);
  dirtyFiles.delete(path);

  if (activeFilePath === path) {
    if (openTabs.length > 0) {
      openFile(openTabs[openTabs.length - 1]);
    } else {
      activeFilePath = null;
      if (editorInstance) editorInstance.setModel(null);
      document.getElementById('editor-placeholder').style.display = 'flex';
      updateBreadcrumbs(null);
      updateStatusBarInfo(null);
    }
  }

  updateTabsUI();
  renderFileTree();
}

function updateTabsUI() {
  const tabBar = document.getElementById('tab-bar');
  tabBar.innerHTML = '';

  openTabs.forEach(path => {
    const filename = path.split('/').pop();
    const ext = filename.split('.').pop().toLowerCase();
    
    const tab = document.createElement('div');
    tab.className = 'tab';
    if (path === activeFilePath) tab.classList.add('active');
    if (dirtyFiles.has(path)) tab.classList.add('dirty');

    // Add Icon type
    let iconType = 'file-text';
    if (ext === 'html' || ext === 'htm') iconType = 'file-code';
    else if (ext === 'css') iconType = 'braces';
    else if (ext === 'js' || ext === 'javascript') iconType = 'file-json';
    else if (ext === 'md' || ext === 'markdown') iconType = 'book-open';
    
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', iconType);
    icon.className = 'tab-icon-svg';
    icon.style.width = '14px';
    icon.style.height = '14px';
    if (ext === 'html') icon.style.color = '#e34c26';
    else if (ext === 'css') icon.style.color = '#264de4';
    else if (ext === 'js') icon.style.color = '#f0db4f';
    else if (ext === 'md') icon.style.color = '#007acc';
    
    tab.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = filename;
    tab.appendChild(label);

    const dot = document.createElement('span');
    dot.className = 'tab-dirty-dot';
    tab.appendChild(dot);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '<i data-lucide="x"></i>';
    closeBtn.addEventListener('click', (e) => closeTab(path, e));
    tab.appendChild(closeBtn);

    tab.addEventListener('click', () => openFile(path));

    tabBar.appendChild(tab);
  });
  
  lucide.createIcons();
}

// 9. Breadcrumbs Updates
function updateBreadcrumbs(path) {
  const container = document.getElementById('breadcrumbs');
  container.innerHTML = '';
  
  const rootSpan = document.createElement('span');
  rootSpan.className = 'breadcrumb-item';
  rootSpan.textContent = 'workspace';
  container.appendChild(rootSpan);
  
  if (!path) {
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = '>';
    container.appendChild(separator);
    
    const span = document.createElement('span');
    span.className = 'breadcrumb-item font-semibold';
    span.textContent = 'No File Open';
    container.appendChild(span);
    return;
  }
  
  const parts = path.split('/').filter(Boolean);
  parts.forEach((part, index) => {
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = '>';
    container.appendChild(separator);
    
    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    if (index === parts.length - 1) {
      span.classList.add('font-semibold');
    }
    span.textContent = part;
    container.appendChild(span);
  });
}

// 10. Status Bar updates
function updateStatusBarInfo(path) {
  const fileInfo = document.getElementById('status-file-info');
  if (path) {
    fileInfo.textContent = path.split('/').pop();
  } else {
    fileInfo.textContent = 'No Open File';
  }
}

// 11. Modal System & Settings Mapping
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

// Close modals
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  if (modalId === 'creation-modal') {
    document.getElementById('creation-name-input').value = '';
    document.getElementById('creation-error').textContent = '';
  }
}

document.querySelectorAll('.modal-close, .modal-close-btn, .modal-backdrop').forEach(el => {
  el.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) closeModal(modal.id);
  });
});

function loadSettingsIntoModal() {
  document.getElementById('settings-theme').value = settings.theme;
  document.getElementById('settings-font-size').value = settings.fontSize;
  document.getElementById('settings-tab-size').value = settings.tabSize;
  document.getElementById('settings-autosave').checked = settings.autoSave;
  document.getElementById('settings-minimap').checked = settings.minimap;
  document.getElementById('settings-wordwrap').checked = settings.wordWrap;
}

function saveSettingsFromModal() {
  const originalTheme = settings.theme;
  
  settings.theme = document.getElementById('settings-theme').value;
  settings.fontSize = parseInt(document.getElementById('settings-font-size').value);
  settings.tabSize = parseInt(document.getElementById('settings-tab-size').value);
  settings.autoSave = document.getElementById('settings-autosave').checked;
  settings.minimap = document.getElementById('settings-minimap').checked;
  settings.wordWrap = document.getElementById('settings-wordwrap').checked;

  saveSettingsToStorage();
  
  if (editorInstance) {
    editorInstance.updateOptions({
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      minimap: { enabled: settings.minimap },
      wordWrap: settings.wordWrap ? "on" : "off"
    });
  }

  if (originalTheme !== settings.theme) {
    updateActiveTheme(settings.theme);
  }

  document.getElementById('status-autosave-indicator').textContent = `Spaces: ${settings.tabSize}`;
}

function updateActiveTheme(themeName) {
  document.body.className = '';
  document.body.classList.add(themeName);
  
  if (monaco && editorInstance) {
    let monacoTheme = 'vscode-dark';
    if (themeName === 'theme-vscode-light') monacoTheme = 'vscode-light';
    else if (themeName === 'theme-dracula') monacoTheme = 'dracula';
    else if (themeName === 'theme-onedark') monacoTheme = 'onedark';
    
    monaco.editor.setTheme(monacoTheme);
  }
}

// 12. Create / Rename / Delete Operations
let creationType = 'file';

function handleCreateNodeSubmit() {
  const input = document.getElementById('creation-name-input');
  const errorEl = document.getElementById('creation-error');
  let name = input.value.trim();
  
  if (!name) {
    errorEl.textContent = 'Name is required';
    return;
  }

  if (name.includes('/')) {
    errorEl.textContent = 'Name cannot contain "/"';
    return;
  }

  let pathPrefix = '/';
  if (activeFilePath) {
    const parts = activeFilePath.split('/');
    parts.pop();
    pathPrefix = parts.join('/') + '/';
    if (pathPrefix === '') pathPrefix = '/';
  }

  const targetPath = pathPrefix + name;

  if (files[targetPath]) {
    errorEl.textContent = 'A file or folder with this name already exists';
    return;
  }

  if (creationType === 'folder') {
    files[targetPath] = { isFolder: true };
    expandedFolders.add(targetPath);
  } else {
    files[targetPath] = { isFolder: false, content: '' };
  }

  saveToStorage();
  closeModal('creation-modal');
  renderFileTree();
  
  if (creationType === 'file') {
    openFile(targetPath);
  }
}

function handleDeleteNode(path) {
  const confirmDel = confirm(`Are you sure you want to delete "${path.split('/').pop()}"?`);
  if (!confirmDel) return;

  if (files[path]) {
    if (files[path].isFolder) {
      for (const key of Object.keys(files)) {
        if (key === path || key.startsWith(path + '/')) {
          deleteNodeFromWorkspace(key);
        }
      }
    } else {
      deleteNodeFromWorkspace(path);
    }
    
    saveToStorage();
    renderFileTree();
  }
}

function deleteNodeFromWorkspace(path) {
  delete files[path];
  
  if (editorModels[path]) {
    editorModels[path].dispose();
    delete editorModels[path];
  }

  openTabs = openTabs.filter(t => t !== path);
  dirtyFiles.delete(path);
  
  if (activeFilePath === path) {
    activeFilePath = null;
    if (editorInstance) editorInstance.setModel(null);
    document.getElementById('editor-placeholder').style.display = 'flex';
    updateBreadcrumbs(null);
    updateStatusBarInfo(null);
  }
  updateTabsUI();
}

function handleRenameNode(oldPath) {
  const currentName = oldPath.split('/').pop();
  const newName = prompt(`Enter new name for "${currentName}":`, currentName);
  
  if (!newName || newName.trim() === '' || newName === currentName) return;
  if (newName.includes('/')) {
    alert('Name cannot contain "/"');
    return;
  }

  const parts = oldPath.split('/');
  parts.pop();
  const pathPrefix = parts.join('/') + '/';
  const newPath = (pathPrefix === '/' ? '/' : pathPrefix) + newName.trim();

  if (files[newPath]) {
    alert('A file or folder already exists with that name.');
    return;
  }

  if (files[oldPath].isFolder) {
    const updatedFiles = {};
    for (const [key, value] of Object.entries(files)) {
      if (key === oldPath) {
        updatedFiles[newPath] = value;
      } else if (key.startsWith(oldPath + '/')) {
        const relativePart = key.slice(oldPath.length);
        updatedFiles[newPath + relativePart] = value;
      } else {
        updatedFiles[key] = value;
      }
    }
    
    openTabs = openTabs.map(t => {
      if (t === oldPath) return newPath;
      if (t.startsWith(oldPath + '/')) return newPath + t.slice(oldPath.length);
      return t;
    });

    if (activeFilePath && (activeFilePath === oldPath || activeFilePath.startsWith(oldPath + '/'))) {
      const relativePart = activeFilePath.slice(oldPath.length);
      activeFilePath = newPath + relativePart;
    }

    files = updatedFiles;
  } else {
    files[newPath] = files[oldPath];
    delete files[oldPath];
    
    if (editorModels[oldPath]) {
      editorModels[oldPath].dispose();
      delete editorModels[oldPath];
    }

    openTabs = openTabs.map(t => t === oldPath ? newPath : t);
    
    if (activeFilePath === oldPath) {
      activeFilePath = newPath;
    }
  }

  saveToStorage();
  updateTabsUI();
  updateBreadcrumbs(activeFilePath);
  updateStatusBarInfo(activeFilePath);
  renderFileTree();
  
  if (activeFilePath) {
    openFile(activeFilePath);
  }
}

// Triggers browser local file download
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = URL.createObjectURL(blob);
  downloadAnchor.download = filename;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(downloadAnchor.href);
}

// 13. Workspace Export / Import / Local Openers
function exportWorkspace() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(files, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href",     dataStr);
  downloadAnchor.setAttribute("download", "vscode_notepad_workspace.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function triggerImportWorkspace() {
  document.getElementById('file-import-input').click();
}

function handleImportWorkspace(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      const keys = Object.keys(importedData);
      const isValid = keys.length > 0 && keys.every(k => k.startsWith('/') && typeof importedData[k].isFolder === 'boolean');
      
      if (!isValid) {
        alert('Invalid workspace JSON file.');
        return;
      }

      if (confirm('Importing will overwrite your current workspace files. Proceed?')) {
        Object.keys(editorModels).forEach(k => {
          editorModels[k].dispose();
        });
        editorModels = {};
        
        files = importedData;
        openTabs = [];
        activeFilePath = null;
        dirtyFiles.clear();
        
        saveToStorage();
        renderFileTree();
        updateTabsUI();
        
        const firstFile = Object.keys(files).filter(k => !files[k].isFolder)[0];
        if (firstFile) {
          openFile(firstFile);
        } else {
          document.getElementById('editor-placeholder').style.display = 'flex';
          updateBreadcrumbs(null);
          updateStatusBarInfo(null);
        }
      }
    } catch(err) {
      alert('Failed to parse JSON file.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Local File Upload Reader
function handleLocalFileOpen(event) {
  const file = event.target.files[0];
  if (!file) return;

  const virtualPath = '/' + file.name;
  
  if (files[virtualPath] && !files[virtualPath].isFolder) {
    const replace = confirm(`File "${file.name}" already exists in the workspace. Overwrite?`);
    if (!replace) return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    files[virtualPath] = { isFolder: false, content: e.target.result };
    saveToStorage();
    renderFileTree();
    openFile(virtualPath);
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Local Directory webkitdirectory Uploader
function handleLocalFolderOpen(event) {
  const filesList = event.target.files;
  if (filesList.length === 0) return;

  const append = confirm("Append these files to your current workspace? (Cancel will clear the current workspace first)");
  if (!append) {
    Object.keys(editorModels).forEach(k => {
      editorModels[k].dispose();
    });
    editorModels = {};
    files = {};
    openTabs = [];
    activeFilePath = null;
    dirtyFiles.clear();
  }

  let loadedCount = 0;
  Array.from(filesList).forEach(file => {
    // Relative path foldername/subfolder/file.js -> /foldername/subfolder/file.js
    const virtualPath = '/' + file.webkitRelativePath;
    
    // Register parent folder structure keys
    const parts = virtualPath.split('/').filter(Boolean);
    let currPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currPath += '/' + parts[i];
      files[currPath] = { isFolder: true };
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      files[virtualPath] = { isFolder: false, content: e.target.result };
      loadedCount++;
      
      if (loadedCount === filesList.length) {
        saveToStorage();
        renderFileTree();
        updateTabsUI();
        
        // Open the first loaded readable file
        const textFiles = Object.keys(files).filter(k => !files[k].isFolder && (
          k.endsWith('.html') || k.endsWith('.css') || k.endsWith('.js') || 
          k.endsWith('.md') || k.endsWith('.txt') || k.endsWith('.json')
        ));
        if (textFiles.length > 0) {
          openFile(textFiles[0]);
        }
      }
    };
    reader.readAsText(file);
  });
  
  event.target.value = '';
}

// 14. Activity Bar Actions & Listeners
function bindEvents() {
  const actExplorer = document.getElementById('act-explorer');
  actExplorer.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    
    if (sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
      resizer.style.display = 'block';
      actExplorer.classList.add('active');
    } else {
      sidebar.style.display = 'none';
      resizer.style.display = 'none';
      actExplorer.classList.remove('active');
    }
    
    if (editorInstance) {
      setTimeout(() => editorInstance.layout(), 50);
    }
  });

  document.getElementById('act-settings').addEventListener('click', () => {
    loadSettingsIntoModal();
    openModal('settings-modal');
  });

  document.getElementById('btn-new-file').addEventListener('click', () => {
    creationType = 'file';
    document.getElementById('creation-modal-title').textContent = 'New File';
    document.getElementById('creation-input-label').textContent = 'File Name (e.g. index.html, script.js)';
    document.getElementById('creation-name-input').placeholder = 'file.js';
    openModal('creation-modal');
    document.getElementById('creation-name-input').focus();
  });

  document.getElementById('btn-new-folder').addEventListener('click', () => {
    creationType = 'folder';
    document.getElementById('creation-modal-title').textContent = 'New Folder';
    document.getElementById('creation-input-label').textContent = 'Folder Name';
    document.getElementById('creation-name-input').placeholder = 'components';
    openModal('creation-modal');
    document.getElementById('creation-name-input').focus();
  });

  // Local file opener bindings
  document.getElementById('btn-open-local-file').addEventListener('click', () => {
    document.getElementById('local-file-input').click();
  });
  document.getElementById('local-file-input').addEventListener('change', handleLocalFileOpen);

  // Local folder opener bindings
  document.getElementById('btn-open-local-folder').addEventListener('click', () => {
    document.getElementById('local-folder-input').click();
  });
  document.getElementById('local-folder-input').addEventListener('change', handleLocalFolderOpen);

  document.getElementById('placeholder-new-file').addEventListener('click', () => {
    document.getElementById('btn-new-file').click();
  });

  document.getElementById('btn-collapse-tree').addEventListener('click', () => {
    expandedFolders.clear();
    renderFileTree();
  });

  document.getElementById('btn-export-project').addEventListener('click', exportWorkspace);
  document.getElementById('btn-import-project').addEventListener('click', triggerImportWorkspace);
  document.getElementById('file-import-input').addEventListener('change', handleImportWorkspace);

  document.getElementById('btn-save-file').addEventListener('click', () => {
    if (activeFilePath && editorInstance) {
      saveFile(activeFilePath, editorInstance.getValue());
      downloadFile(activeFilePath.split('/').pop(), editorInstance.getValue());
    }
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    loadSettingsIntoModal();
    openModal('settings-modal');
  });

  document.getElementById('creation-submit-btn').addEventListener('click', handleCreateNodeSubmit);
  document.getElementById('creation-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreateNodeSubmit();
  });

  document.querySelectorAll('#settings-modal .modal-close, #settings-modal .modal-close-btn, #settings-modal .modal-backdrop').forEach(el => {
    el.addEventListener('click', saveSettingsFromModal);
  });

  document.getElementById('btn-reset-workspace').addEventListener('click', () => {
    const confirmReset = confirm('Are you sure you want to restore all template files? This wipes the local storage.');
    if (confirmReset) {
      Object.keys(editorModels).forEach(k => {
        editorModels[k].dispose();
      });
      editorModels = {};
      
      files = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE));
      openTabs = [];
      activeFilePath = null;
      dirtyFiles.clear();
      
      saveToStorage();
      closeModal('settings-modal');
      renderFileTree();
      updateTabsUI();
      
      const firstFile = Object.keys(files).filter(k => !files[k].isFolder)[0];
      if (firstFile) {
        openFile(firstFile);
      } else {
        document.getElementById('editor-placeholder').style.display = 'flex';
        updateBreadcrumbs(null);
        updateStatusBarInfo(null);
      }
    }
  });

  document.getElementById('ctx-rename').addEventListener('click', () => {
    if (contextMenuTarget) handleRenameNode(contextMenuTarget.path);
  });
  document.getElementById('ctx-delete').addEventListener('click', () => {
    if (contextMenuTarget) handleDeleteNode(contextMenuTarget.path);
  });
}

// 15. System Bootloader
function initApp() {
  loadFromStorage();
  initLayoutResizers();
  bindEvents();
  initMonaco();
}

window.addEventListener('DOMContentLoaded', initApp);
