/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";

// --- DOM Elements ---
const fileUploadInput = document.getElementById('file-upload') as HTMLInputElement;
const fileListContainer = document.getElementById('file-list-container');
const processBtn = document.getElementById('process-btn') as HTMLButtonElement;
const resultContainer = document.getElementById('result-container');
const loader = document.getElementById('loader');
const outputArea = document.getElementById('output-area');
const outputContent = document.getElementById('output-content');
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const errorMessage = document.getElementById('error-message');

// --- State ---
let selectedFiles: File[] = [];
let markdownResult: string = '';

// --- Gemini AI Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const PROMPT_TEMPLATE = `
#### 1. 角色与目标 (Role & Goal)
你是一个精通信息整合和数据清洗的专家级AI助手。你的任务是将一份内容混杂、格式混乱的原始文本，转换成一份逻辑清晰、结构合理、内容无损的结构化文档。

#### 2. 核心指令 (Core Instructions)
请严格遵循以下步骤，处理我提供的原始文本：

**步骤一：格式解析与清理 (Format Parsing & Cleaning)**
- **识别并移除格式标签**：去除所有非内容性的HTML标签（如 \`<div>\`, \`<span>\`, \`<p>\`, \`<body>\` 等）和Markdown标记（如 \`#\`, \`*\`, \`-\`, \`[]()\` 等）。
- **保留语义信息**：在移除标签的同时，要理解其原始意图。例如，\`<h1>\` 或 \`# 标题\` 暗示这是一个顶级标题；\`<li>\` 或 \`- 列表项\` 暗示这是一个列表项。在后续的结构化步骤中要保留这种层级和关系。
- **清理空白与噪声**：移除多余的空格、空行和不必要的特殊字符，使文本干净整洁。

**步骤二：信息识别与提取 (Information Identification & Extraction)**
- 将清理后的文本分解为独立的“信息单元”（可以是一个句子、一个段落、一个定义或一个关键数据点）。
- 仔细阅读和理解每一个信息单元的核心含义。

**步骤三：主题归类与结构化 (Topic Clustering & Structuring)**
- **识别核心主题**：分析所有的信息单元，找出其中反复出现的几个核心主题或议题。
- **构建逻辑大纲**：根据识别出的核心主题，创建一个逻辑清晰的层级大纲（例如：主题A -> 子主题A1 -> 具体信息；主题B -> 子主题B1 -> 具体信息）。
- **内容归位**：将每一个信息单元，根据其内容，精准地放置到大纲的相应位置下。

**步骤四：内容去重与合并 (Deduplication & Merging)**
- **识别重复/相似内容**：找出内容完全相同或语义上高度相似的信息单元。
- **智能合并**：
    - 对于**完全相同**的内容，只保留一个。
    - 对于**部分重叠或互为补充**的内容（例如，一处说“苹果是水果”，另一处说“苹果富含维生素”），将它们合并成一个更完整、更准确的陈述（如“苹果是一种富含维生素的水果”）。
    - 合并时，要确保新生成的语句通顺自然。

**步骤五：保持信息完整性 (Maintain Information Integrity)**
- **这是最高准则**：在整个整理过程中，绝对不能主观臆断、任意删减任何**独特的、非重复的**信息点。即使某个信息点看起来不重要或与主题略有偏离，也必须保留下来，可以放在一个“其他信息”或相关性较低的类别下。
- **目标是“无损重组”，而非“有损压缩”**。

#### 3. 输出要求 (Output Requirements)
- **格式**: 请使用清晰的 **Markdown** 格式进行输出。
- **结构**:
    - 使用不同级别的标题（\`#\`, \`##\`, \`###\`）来体现信息的层级结构。
    - 对并列信息使用无序列表（\`-\`）或有序列表（\`1.\`）。
    - 对关键术语或重点内容可以使用**粗体**进行强调。
- **语言**: 使用简洁、中立、专业、易于理解的语言风格。

#### 4. 待处理文本 (Text to Process)
[ {file_content} ]
`;


// --- Functions ---

/** Renders the list of selected files in the UI */
function renderFileList() {
  if (!fileListContainer) return;
  fileListContainer.innerHTML = '';
  if (selectedFiles.length === 0) {
    fileListContainer.innerHTML = '<p class="no-files">未选择文件</p>';
    processBtn.disabled = true;
    return;
  }

  const list = document.createElement('ul');
  list.setAttribute('aria-label', 'Selected files');
  selectedFiles.forEach((file, index) => {
    const listItem = document.createElement('li');
    listItem.innerHTML = `
      <span>${file.name}</span>
      <button class="remove-btn" data-index="${index}" aria-label="Remove ${file.name}">&times;</button>
    `;
    list.appendChild(listItem);
  });
  fileListContainer.appendChild(list);
  processBtn.disabled = false;
}

/** Handles file selection from the input */
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    // Add new files, preventing duplicates
    const currentFileNames = new Set(selectedFiles.map(f => f.name));
    for (const file of Array.from(target.files)) {
      if (!currentFileNames.has(file.name)) {
        selectedFiles.push(file);
      }
    }
    renderFileList();
  }
  // Reset the input value to allow re-selecting the same file if removed
  target.value = '';
}

/** Handles removing a file from the selected list */
function handleFileRemove(event: Event) {
    const target = event.target as HTMLElement;
    if (target.classList.contains('remove-btn')) {
        const index = parseInt(target.dataset.index || '-1');
        if (index > -1) {
            selectedFiles.splice(index, 1);
            renderFileList();
        }
    }
}


/** Reads a file and returns its content as a string promise */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Main function to process files */
async function processFiles() {
  if (selectedFiles.length === 0) return;

  // --- UI Update: Show loading state ---
  processBtn.disabled = true;
  resultContainer?.classList.remove('hidden');
  loader?.classList.remove('hidden');
  outputArea?.classList.add('hidden');
  errorMessage?.classList.add('hidden');

  try {
    const fileContents = await Promise.all(selectedFiles.map(readFileAsText));
    const combinedContent = fileContents.join('\n\n---\n\n');
    const finalPrompt = PROMPT_TEMPLATE.replace('{file_content}', combinedContent);

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: finalPrompt,
    });
    
    markdownResult = response.text;
    const htmlResult = await marked.parse(markdownResult);

    if (outputContent) {
      outputContent.innerHTML = htmlResult;
    }
    outputArea?.classList.remove('hidden');

  } catch (error) {
    console.error("Error processing files:", error);
    if(errorMessage) {
        errorMessage.textContent = '处理文件时发生错误。请检查您的网络连接或文件内容，然后重试。';
        errorMessage.classList.remove('hidden');
    }
  } finally {
    // --- UI Update: Hide loading state ---
    loader?.classList.add('hidden');
    processBtn.disabled = false;
  }
}

/** Handles downloading the result */
function downloadResult() {
  if (!markdownResult) return;
  const blob = new Blob([markdownResult], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'processed_result.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Event Listeners ---
fileUploadInput?.addEventListener('change', handleFileSelect);
fileListContainer?.addEventListener('click', handleFileRemove);
processBtn?.addEventListener('click', processFiles);
downloadBtn?.addEventListener('click', downloadResult);

// --- Initial Render ---
renderFileList();
