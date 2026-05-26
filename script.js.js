// 简单的导航栏激活状态管理（可选，因为HTML里已经写了class="active"）
const currentLocation = location.href;
const menuItem = document.querySelectorAll('.nav-links a');
const menuLength = menuItem.length;
for (let i = 0; i < menuLength; i++) {
    if (menuItem[i].href === currentLocation) {
        menuItem[i].className = "active";
    }
}

/**
 * 核心功能：加载并解析 Excel 文件
 * @param {string} filePath - Excel 文件的路径
 */
async function loadExcel(filePath) {
    const tableElement = document.getElementById('excel-data-table');
    
    try {
        // 获取 Excel 文件
        const response = await fetch(filePath);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        
        // 使用 SheetJS 解析数据
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // 获取第一个工作表的名字
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 将工作表转换为 HTML 表格字符串
        // header: 1 表示生成二维数组，但我们要用 sheet_to_html 保持格式
        const htmlString = XLSX.utils.sheet_to_html(worksheet, { id: "excel-data-table", editable: false });
        
        // 替换掉原有的空表格
        // 注意：sheet_to_html 会生成完整的 <table> 标签，我们需要提取内容或者替换整个 innerHTML
        // 为了保留我们 CSS 定义的 class，我们手动解析一下或者直接替换
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        const newTable = tempDiv.querySelector('table');
        
        // 将生成的表格类名设置为我们定义的样式类
        if(newTable) {
            newTable.className = 'excel-table';
            document.getElementById('excel-wrapper').innerHTML = '';
            document.getElementById('excel-wrapper').appendChild(newTable);
        }

    } catch (error) {
        console.error('Excel 加载失败:', error);
        tableElement.innerHTML = `
            <thead><tr><td style="color:red">错误</td></tr></thead>
            <tbody><tr><td>无法加载 ${filePath}。<br>请检查文件是否存在于根目录，<br>或者是否因浏览器安全策略(CORS)被拦截。<br>(建议在本地服务器或GitHub Pages上查看)</td></tr></tbody>
        `;
    }
}
