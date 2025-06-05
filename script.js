// 图片缓存管理系统
class ImageCacheManager {
    constructor() {
        this.dbName = 'TierMakerImageCache';
        this.dbVersion = 1;
        this.storeName = 'images';
        this.db = null;
        // 不在构造函数中立即初始化，而是在需要时初始化
    }

    async initDB() {
        try {
            console.log('开始初始化IndexedDB...');
            return new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    console.error('浏览器不支持IndexedDB');
                    reject(new Error('浏览器不支持IndexedDB'));
                    return;
                }
                
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = () => {
                    console.error('IndexedDB初始化失败:', request.error);
                    reject(request.error);
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('✅ IndexedDB初始化成功');
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (event) => {
                    console.log('🔧 IndexedDB需要升级，创建存储结构...');
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, { keyPath: 'url' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        console.log('✅ IndexedDB存储结构创建成功');
                    }
                };
            });
        } catch (error) {
            console.error('IndexedDB初始化异常:', error);
            throw error;
        }
    }

    async cacheImage(url) {
        console.log('🔄 开始缓存图片:', url);
        
        try {
            // 确保数据库已初始化
            if (!this.db) {
                console.log('数据库未初始化，正在初始化...');
                await this.initDB();
            }

            // 检查是否已经缓存
            const cached = await this.getImage(url);
            if (cached) {
                console.log('✅ 图片已缓存，直接返回:', url);
                return cached.dataUrl;
            }

            console.log('📥 开始下载图片:', url);
            
            // 尝试多种方式获取图片数据
            let blob;
            try {
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                blob = await response.blob();
                console.log('✅ 通过fetch下载成功，大小:', blob.size, 'bytes');
            } catch (fetchError) {
                console.warn('fetch失败，尝试其他方法:', fetchError);
                // 如果fetch失败，尝试使用Image + Canvas的方式
                return await this.cacheImageViaCanvas(url);
            }
            
            const dataUrl = await this.blobToDataUrl(blob);
            
            // 存储到IndexedDB
            await this.storeImage(url, dataUrl, blob.size);
            console.log('✅ 图片缓存成功:', url);
            
            return dataUrl;
        } catch (error) {
            console.error('❌ 图片缓存失败:', url, error);
            return url; // 返回原始URL作为备用
        }
    }

    // 备用缓存方法：使用Image + Canvas
    async cacheImageViaCanvas(url) {
        return new Promise((resolve, reject) => {
            console.log('🎨 尝试通过Canvas缓存图片:', url);
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/png');
                    
                    // 估算大小并存储
                    const estimatedSize = dataUrl.length * 0.75; // base64的大概大小
                    this.storeImage(url, dataUrl, estimatedSize).then(() => {
                        console.log('✅ 通过Canvas缓存成功:', url);
                        resolve(dataUrl);
                    }).catch(error => {
                        console.warn('Canvas缓存存储失败:', error);
                        resolve(dataUrl); // 即使存储失败，也返回dataUrl
                    });
                } catch (error) {
                    console.warn('Canvas转换失败:', error);
                    resolve(url); // 返回原始URL
                }
            };
            
            img.onerror = () => {
                console.warn('Image加载失败:', url);
                resolve(url); // 返回原始URL
            };
            
            img.src = url;
        });
    }

    async getImage(url) {
        if (!this.db) return null;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async storeImage(url, dataUrl, size) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const data = {
                url: url,
                dataUrl: dataUrl,
                timestamp: Date.now(),
                size: size
            };
            
            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    // 清理过期缓存（可选）
    async cleanOldCache(maxAge = 7 * 24 * 60 * 60 * 1000) { // 默认7天
        if (!this.db) return;
        
        const cutoff = Date.now() - maxAge;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('timestamp');
        const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    }

    // 获取缓存统计信息
    async getCacheStats() {
        if (!this.db) return { count: 0, totalSize: 0 };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const items = request.result;
                const stats = {
                    count: items.length,
                    totalSize: items.reduce((sum, item) => sum + (item.size || 0), 0)
                };
                resolve(stats);
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// 全局图片缓存管理器
const imageCache = new ImageCacheManager();

// 初始化缓存系统
async function initializeCacheSystem() {
    try {
        console.log('🚀 初始化图片缓存系统...');
        await imageCache.initDB();
        const stats = await imageCache.getCacheStats();
        console.log(`📊 缓存系统已就绪，当前缓存: ${stats.count} 张图片`);
        
        // 清理7天前的缓存
        await imageCache.cleanOldCache();
        
        return true;
    } catch (error) {
        console.error('❌ 缓存系统初始化失败:', error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // 先初始化缓存系统
    await initializeCacheSystem();
    const tierListContainer = document.getElementById('tier-list-container');
    const addTierBtn = document.getElementById('add-tier-btn');
    const imageUploadInput = document.getElementById('image-upload-input');
    const imagePool = document.getElementById('image-pool');

    // Bangumi search elements
    const bangumiSearchInput = document.getElementById('bangumi-search-input');
    const bangumiSearchBtn = document.getElementById('bangumi-search-btn');
    const bangumiResultsContainer = document.getElementById('bangumi-results-container');
    
    // Bangumi Auth Elements
    const bangumiLoginBtn = document.getElementById('bangumi-login-btn');
    const bangumiUserInfoDiv = document.getElementById('bangumi-user-info');
    const bangumiUsernameSpan = document.getElementById('bangumi-username');
    const bangumiLogoutBtn = document.getElementById('bangumi-logout-btn');
    const nsfwToggleDiv = document.querySelector('.nsfw-toggle');
    const nsfwCheckbox = document.getElementById('nsfw-checkbox');

    // Bangumi API Constants - IMPORTANT: Configure BGM_APP_REDIRECT_URI correctly!
    const BGM_CLIENT_ID = 'bgm40006841957e000e9'; // Your Client ID
    // This MUST match the redirect_uri configured in your Bangumi app AND in your auth_server.ts
    // For Deno Deploy, this should be: https://your-project-name.deno.dev/api/auth/bangumi/callback
    // For local development: http://localhost:8000/api/auth/bangumi/callback
    const BGM_APP_REDIRECT_URI = window.location.origin + '/api/auth/bangumi/callback';

    let tiers = [];
    let nextTierId = 0;
    let draggedImage = null;

    const defaultTiers = [
        { name: '神', color: '#ff7f7f' },
        { name: '佳作', color: '#ffbf7f' },
        { name: '良作', color: '#ffff7f' },
        { name: '一般', color: '#bfff7f' },
        { name: '烂', color: '#7fff7f' }
    ];

    function renderTiers() {
        tierListContainer.innerHTML = ''; // Clear existing tiers
        tiers.forEach(tier => {
            const tierElement = createTierElement(tier);
            tierListContainer.appendChild(tierElement);
        });
        addDragListenersToImages();
    }

    function createTierElement(tier) {
        const tierElement = document.createElement('div');
        tierElement.classList.add('tier');
        tierElement.dataset.tierId = tier.id;

        const labelContainer = document.createElement('div');
        labelContainer.classList.add('tier-label');
        labelContainer.style.backgroundColor = tier.color || getRandomColor();
        labelContainer.textContent = tier.name;
        labelContainer.addEventListener('click', () => renameTier(tier.id));

        const imagesContainer = document.createElement('div');
        imagesContainer.classList.add('tier-images');
        imagesContainer.addEventListener('dragover', allowDrop);
        imagesContainer.addEventListener('drop', (event) => dropImage(event, tier.id));

        tier.images.forEach(imgSrc => {
            const img = createImageElement(imgSrc);
            imagesContainer.appendChild(img);
        });

        const controlsContainer = createTierControls(tier.id);

        tierElement.appendChild(labelContainer);
        tierElement.appendChild(imagesContainer);
        tierElement.appendChild(controlsContainer);
        return tierElement;
    }

    function createTierControls(tierId) {
        const controlsContainer = document.createElement('div');
        controlsContainer.classList.add('tier-controls');

        const moveUpBtn = document.createElement('button');
        moveUpBtn.innerHTML = '&#9650;'; // Up arrow
        moveUpBtn.title = '向上移动';
        moveUpBtn.addEventListener('click', () => moveTier(tierId, -1));

        const moveDownBtn = document.createElement('button');
        moveDownBtn.innerHTML = '&#9660;'; // Down arrow
        moveDownBtn.title = '向下移动';
        moveDownBtn.addEventListener('click', () => moveTier(tierId, 1));

        const renameBtn = document.createElement('button');
        renameBtn.innerHTML = '&#9998;'; // Pencil icon (using unicode)
        renameBtn.title = '重命名';
        renameBtn.addEventListener('click', () => renameTier(tierId));

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&#10005;'; // Cross icon (using unicode)
        deleteBtn.title = '删除级别';
        deleteBtn.addEventListener('click', () => deleteTier(tierId));
        
        const changeColorBtn = document.createElement('button');
        changeColorBtn.innerHTML = '&#127912;'; // Palette icon
        changeColorBtn.title = '更改颜色';
        changeColorBtn.addEventListener('click', () => changeTierColor(tierId));


        controlsContainer.appendChild(moveUpBtn);
        controlsContainer.appendChild(renameBtn);
        controlsContainer.appendChild(changeColorBtn);
        controlsContainer.appendChild(deleteBtn);
        controlsContainer.appendChild(moveDownBtn);
        return controlsContainer;
    }
    
    function changeTierColor(tierId) {
        const tier = tiers.find(t => t.id === tierId);
        if (!tier) return;

        const color = prompt("输入新的颜色 (例如, #FF0000 or red):", tier.color);
        if (color) {
            tier.color = color;
            saveTiers();
            renderTiers();
        }
    }


    function addNewTier(name = '新级别', color = getRandomColor(), images = []) {
        const newTier = {
            id: nextTierId++,
            name: name,
            color: color,
            images: images
        };
        tiers.push(newTier);
        saveTiers();
        renderTiers();
    }

    function renameTier(tierId) {
        const tier = tiers.find(t => t.id === tierId);
        if (tier) {
            const newName = prompt('输入级别新名称:', tier.name);
            if (newName !== null && newName.trim() !== '') {
                tier.name = newName.trim();
                saveTiers();
                renderTiers();
            }
        }
    }

    function deleteTier(tierId) {
        if (confirm('确定要删除这个级别吗？级别中的图片将会被移回图片池。')) {
            const tierIndex = tiers.findIndex(t => t.id === tierId);
            if (tierIndex > -1) {
                const tierToMove = tiers[tierIndex];
                tierToMove.images.forEach(imgSrc => {
                    if (!Array.from(imagePool.children).some(container => {
                        const img = container.querySelector('img');
                        return img && img.src === imgSrc;
                    })) {
                        const imgElement = createImageElement(imgSrc);
                        imagePool.appendChild(imgElement);
                    }
                });
                tiers.splice(tierIndex, 1);
                saveTiers();
                renderTiers();
            }
        }
    }


    function moveTier(tierId, direction) {
        const index = tiers.findIndex(t => t.id === tierId);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= tiers.length) return; 

        [tiers[index], tiers[newIndex]] = [tiers[newIndex], tiers[index]];
        
        saveTiers();
        renderTiers();
    }


    function createImageElement(src) {
        const container = document.createElement('div');
        container.style.position = 'relative';
        container.style.display = 'inline-block';
        
        const img = document.createElement('img');
        img.src = src;
        img.classList.add('draggable-image');
        img.draggable = true;
        img.addEventListener('dragstart', dragStart);
        img.addEventListener('dragend', dragEnd);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('image-delete-btn');
        deleteBtn.innerHTML = '×';
        deleteBtn.title = '删除图片';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeImageFromTierOrPool(container, src);
        });
        
        container.appendChild(img);
        container.appendChild(deleteBtn);
        return container;
    }

    function removeImageFromTierOrPool(container, src) {
        if (confirm('确定要删除这张图片吗？')) {
            // Check if image is in a tier
            const tierElement = container.closest('.tier');
            if (tierElement) {
                const tierId = parseInt(tierElement.dataset.tierId);
                const tier = tiers.find(t => t.id === tierId);
                if (tier) {
                    tier.images = tier.images.filter(img => img !== src);
                    saveTiers();
                }
            }
            // Remove from DOM
            container.remove();
            
            // Mark bangumi result as not added if it exists
            markBangumiResultAsNotAdded(src);
        }
    }

    function markBangumiResultAsNotAdded(imageSrc) {
        const resultItems = document.querySelectorAll('.bangumi-result-item');
        resultItems.forEach(item => {
            const img = item.querySelector('img');
            if (img && img.src === imageSrc) {
                item.classList.remove('added');
            }
        });
    }

    function isImageAlreadyAdded(imageSrc) {
        // Check in image pool
        const poolImages = Array.from(imagePool.children);
        if (poolImages.some(container => {
            const img = container.querySelector('img');
            return img && img.src === imageSrc;
        })) {
            return true;
        }
        
        // Check in all tiers
        return tiers.some(tier => tier.images.includes(imageSrc));
    }

    function handleImageUpload(event) {
        const files = event.target.files;
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imgElement = createImageElement(e.target.result);
                    imagePool.appendChild(imgElement);
                };
                reader.readAsDataURL(file);
            }
        }
        imageUploadInput.value = '';
    }

    function dragStart(event) {
        draggedImage = event.target.closest('div'); // Get the container
        setTimeout(() => {
            event.target.classList.add('dragging');
        }, 0);
    }

    function dragEnd(event) {
        event.target.classList.remove('dragging');
        draggedImage = null;
    }

    function allowDrop(event) {
        event.preventDefault();
    }

    function dropImage(event, tierId) {
        event.preventDefault();
        if (draggedImage) {
            const targetTier = tiers.find(t => t.id === tierId);
            const sourceTierElement = draggedImage.closest('.tier');
            const sourceImagePool = draggedImage.closest('#image-pool');
            const imgElement = draggedImage.querySelector('img');
            const imageSrc = imgElement ? imgElement.src : null;

            if (targetTier && imageSrc) {
                if (sourceTierElement) {
                    const sourceTierId = parseInt(sourceTierElement.dataset.tierId);
                    const sourceTier = tiers.find(t => t.id === sourceTierId);
                    if (sourceTier) {
                        sourceTier.images = sourceTier.images.filter(img => img !== imageSrc);
                    }
                }
                
                if (!targetTier.images.includes(imageSrc)) {
                     targetTier.images.push(imageSrc);
                }
                draggedImage.remove(); 

                saveTiers();
                renderTiers(); 
            }
        }
    }
    
    imagePool.addEventListener('dragover', allowDrop);
    imagePool.addEventListener('drop', (event) => {
        event.preventDefault();
        if (draggedImage) {
            const sourceTierElement = draggedImage.closest('.tier');
            const imgElement = draggedImage.querySelector('img');
            const imageSrc = imgElement ? imgElement.src : null;
            
            if (sourceTierElement && imageSrc) { 
                const sourceTierId = parseInt(sourceTierElement.dataset.tierId);
                const sourceTier = tiers.find(t => t.id === sourceTierId);
                if (sourceTier) {
                    sourceTier.images = sourceTier.images.filter(img => img !== imageSrc);
                }
                draggedImage.remove(); 
                
                if (!Array.from(imagePool.children).some(container => {
                    const img = container.querySelector('img');
                    return img && img.src === imageSrc;
                })) {
                    imagePool.appendChild(draggedImage);
                }
                saveTiers();
                renderTiers(); 
            } else {
                if (!imagePool.contains(draggedImage)) {
                    imagePool.appendChild(draggedImage);
                }
            }
            const draggingImg = draggedImage.querySelector('img');
            if (draggingImg) {
                draggingImg.classList.remove('dragging');
            }
            draggedImage = null;
        }
    });


    function addDragListenersToImages() {
        document.querySelectorAll('.draggable-image').forEach(img => {
            img.removeEventListener('dragstart', dragStart);
            img.removeEventListener('dragend', dragEnd);
            img.addEventListener('dragstart', dragStart);
            img.addEventListener('dragend', dragEnd);
        });
    }

    function saveTiers() {
        localStorage.setItem('tiermakerData', JSON.stringify(tiers));
    }

    function loadTiers() {
        const savedData = localStorage.getItem('tiermakerData');
        if (savedData) {
            tiers = JSON.parse(savedData);
            if (tiers.length > 0) {
                 nextTierId = Math.max(...tiers.map(t => t.id)) + 1;
            } else {
                nextTierId = 0;
            }
        } else {
            defaultTiers.forEach(tierData => {
                addNewTier(tierData.name, tierData.color, []);
            });
            return; 
        }
        renderTiers();
    }
    
    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // Global image mode controls
    const globalStretchMode = document.getElementById('global-stretch-mode');
    const globalCropMode = document.getElementById('global-crop-mode');

    globalStretchMode.addEventListener('change', () => {
        if (globalStretchMode.checked) {
            globalCropMode.checked = false;
            document.body.classList.add('global-stretch-mode');
            document.body.classList.remove('global-crop-mode');
        } else {
            document.body.classList.remove('global-stretch-mode');
        }
    });

    globalCropMode.addEventListener('change', () => {
        if (globalCropMode.checked) {
            globalStretchMode.checked = false;
            document.body.classList.add('global-crop-mode');
            document.body.classList.remove('global-stretch-mode');
        } else {
            document.body.classList.remove('global-crop-mode');
        }
    });

    // Export functionality
    const exportTierListBtn = document.getElementById('export-tier-list-btn');
    
    // 将图片URL转换为base64数据URI的辅助函数
    async function convertImageToDataURL(imgElement) {
        return new Promise(async (resolve, reject) => {
            // 如果已经是data URI，直接返回
            if (imgElement.src.startsWith('data:')) {
                resolve(imgElement.src);
                return;
            }
            
            try {
                // 尝试使用fetch API获取图片数据
                const response = await fetch(imgElement.src, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onload = function() {
                        resolve(reader.result);
                    };
                    reader.onerror = function() {
                        console.warn('FileReader错误，使用Image方法:', imgElement.src);
                        fallbackToImageMethod();
                    };
                    reader.readAsDataURL(blob);
                } else {
                    console.warn('Fetch失败，使用Image方法:', imgElement.src);
                    fallbackToImageMethod();
                }
            } catch (error) {
                console.warn('Fetch错误，使用Image方法:', imgElement.src, error);
                fallbackToImageMethod();
            }
            
            function fallbackToImageMethod() {
                // 回退到原始的Image方法
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = function() {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = this.naturalWidth;
                        canvas.height = this.naturalHeight;
                        
                        ctx.drawImage(this, 0, 0);
                        const dataURL = canvas.toDataURL('image/png');
                        resolve(dataURL);
                    } catch (error) {
                        console.warn('Image方法也失败，返回原始URL:', imgElement.src, error);
                        resolve(imgElement.src);
                    }
                };
                
                img.onerror = function() {
                    console.warn('Image加载失败，返回原始URL:', imgElement.src);
                    resolve(imgElement.src);
                };
                
                // 尝试添加时间戳绕过缓存问题
                const url = new URL(imgElement.src);
                url.searchParams.set('_t', Date.now().toString());
                img.src = url.toString();
            }
        });
    }
    
    async function exportTierList() {
        const tierListContainer = document.getElementById('tier-list-container');
        
        try {
            const originalText = exportTierListBtn.textContent;
            exportTierListBtn.textContent = '正在导出...';
            exportTierListBtn.disabled = true;
            
            // 由于使用了图片缓存系统，大部分图片现在都是data URI
            // 只需要处理少数可能还是外部URL的图片
            const allImages = tierListContainer.querySelectorAll('.draggable-image');
            let needsConversion = false;
            
            // 检查是否有非data URI的图片
            allImages.forEach(img => {
                if (!img.src.startsWith('data:')) {
                    needsConversion = true;
                }
            });
            
            let canvas;
            
            if (needsConversion) {
                exportTierListBtn.textContent = '正在处理剩余图片...';
                console.log('发现非缓存图片，进行转换');
                
                const imageConversions = [];
                for (const img of allImages) {
                    if (!img.src.startsWith('data:')) {
                        imageConversions.push(
                            convertImageToDataURL(img).then(dataURL => {
                                return { element: img, originalSrc: img.src, dataURL: dataURL };
                            }).catch(err => {
                                console.warn('图片转换失败:', img.src, err);
                                return { element: img, originalSrc: img.src, dataURL: img.src };
                            })
                        );
                    }
                }
                
                const convertedImages = await Promise.all(imageConversions);
                
                // 临时替换图片源
                convertedImages.forEach(({ element, dataURL }) => {
                    element.src = dataURL;
                });
                
                exportTierListBtn.textContent = '正在生成图片...';
                await new Promise(resolve => setTimeout(resolve, 300));
                
                canvas = await html2canvas(tierListContainer, {
                    backgroundColor: '#ffffff',
                    scale: 1.5,
                    allowTaint: false,
                    useCORS: false,
                    logging: false
                });
                
                // 恢复原始图片源
                convertedImages.forEach(({ element, originalSrc }) => {
                    element.src = originalSrc;
                });
                
                console.log('导出成功 - 转换方式');
            } else {
                // 所有图片都已缓存，可以直接导出
                console.log('所有图片已缓存，直接导出');
                exportTierListBtn.textContent = '正在生成图片...';
                
                canvas = await html2canvas(tierListContainer, {
                    backgroundColor: '#ffffff',
                    scale: 1.5,
                    allowTaint: false,
                    useCORS: false,
                    logging: false
                });
                
                console.log('导出成功 - 直接方式');
            }
            
            // 下载图片
            const link = document.createElement('a');
            link.download = `tier-list-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = canvas.toDataURL('image/png');
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            exportTierListBtn.textContent = originalText;
            exportTierListBtn.disabled = false;
            
            // 显示缓存统计信息
            const stats = await imageCache.getCacheStats();
            console.log(`导出完成！缓存统计: ${stats.count} 张图片，总大小: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
            
            alert('导出成功！所有Bangumi图片都已正确包含。');
            
        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败: ' + error.message);
            
            exportTierListBtn.textContent = '导出梯队图片';
            exportTierListBtn.disabled = false;
        }
    }

    // 简单导出功能（备用方案）
    async function exportTierListSimple() {
        const tierListContainer = document.getElementById('tier-list-container');
        const exportTierListSimpleBtn = document.getElementById('export-tier-list-simple-btn');
        
        try {
            const originalText = exportTierListSimpleBtn.textContent;
            exportTierListSimpleBtn.textContent = '正在导出...';
            exportTierListSimpleBtn.disabled = true;
            
            const canvas = await html2canvas(tierListContainer, {
                backgroundColor: '#ffffff',
                scale: 1.5,
                allowTaint: false,
                useCORS: false,
                logging: false,
                ignoreElements: function(element) {
                    // 忽略可能有问题的跨域图片
                    if (element.tagName === 'IMG' && 
                        element.src && 
                        !element.src.startsWith('data:') && 
                        !element.src.startsWith(window.location.origin)) {
                        return true;
                    }
                    return false;
                }
            });
            
            const link = document.createElement('a');
            link.download = `tier-list-simple-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = canvas.toDataURL('image/png');
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            exportTierListSimpleBtn.textContent = originalText;
            exportTierListSimpleBtn.disabled = false;
            
            alert('简单导出完成！注意：来自网络的图片可能未包含在导出图片中。');
            
        } catch (error) {
            console.error('简单导出失败:', error);
            alert('导出失败: ' + error.message);
            
            exportTierListSimpleBtn.textContent = '简单导出(可能缺失网络图片)';
            exportTierListSimpleBtn.disabled = false;
        }
    }

    // Event Listeners
    addTierBtn.addEventListener('click', () => addNewTier());
    imageUploadInput.addEventListener('change', handleImageUpload);
    exportTierListBtn.addEventListener('click', exportTierList);
    
    // 添加简单导出按钮的事件监听器
    const exportTierListSimpleBtn = document.getElementById('export-tier-list-simple-btn');
    if (exportTierListSimpleBtn) {
        exportTierListSimpleBtn.addEventListener('click', exportTierListSimple);
    }

    // 缓存管理功能
    const cacheManagerBtn = document.getElementById('cache-manager-btn');
    const cacheManagerPanel = document.getElementById('cache-manager-panel');
    const cacheStatusSpan = document.getElementById('cache-status');
    const refreshCacheStatsBtn = document.getElementById('refresh-cache-stats-btn');
    const cleanOldCacheBtn = document.getElementById('clean-old-cache-btn');
    const clearAllCacheBtn = document.getElementById('clear-all-cache-btn');
    const closeCachePanelBtn = document.getElementById('close-cache-panel-btn');

    // 更新缓存统计信息
    async function updateCacheStats() {
        try {
            const stats = await imageCache.getCacheStats();
            const sizeInMB = (stats.totalSize / 1024 / 1024).toFixed(2);
            cacheStatusSpan.textContent = `已缓存 ${stats.count} 张图片，总大小 ${sizeInMB} MB`;
        } catch (error) {
            cacheStatusSpan.textContent = '获取缓存信息失败';
            console.error('获取缓存统计失败:', error);
        }
    }

    // 清理过期缓存
    async function cleanOldCache() {
        try {
            const before = await imageCache.getCacheStats();
            await imageCache.cleanOldCache();
            const after = await imageCache.getCacheStats();
            
            const cleaned = before.count - after.count;
            alert(`清理完成！删除了 ${cleaned} 张过期图片。`);
            updateCacheStats();
        } catch (error) {
            alert('清理缓存失败: ' + error.message);
            console.error('清理缓存失败:', error);
        }
    }

    // 清空所有缓存
    async function clearAllCache() {
        if (!confirm('确定要删除所有缓存的图片吗？这将需要重新下载Bangumi图片。')) {
            return;
        }
        
        try {
            if (imageCache.db) {
                const transaction = imageCache.db.transaction([imageCache.storeName], 'readwrite');
                const store = transaction.objectStore(imageCache.storeName);
                await new Promise((resolve, reject) => {
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
                
                alert('所有缓存已清空！');
                updateCacheStats();
            }
        } catch (error) {
            alert('清空缓存失败: ' + error.message);
            console.error('清空缓存失败:', error);
        }
    }

    // 缓存管理界面事件
    cacheManagerBtn.addEventListener('click', () => {
        if (cacheManagerPanel.style.display === 'none') {
            cacheManagerPanel.style.display = 'block';
            updateCacheStats();
        } else {
            cacheManagerPanel.style.display = 'none';
        }
    });

    closeCachePanelBtn.addEventListener('click', () => {
        cacheManagerPanel.style.display = 'none';
    });

    refreshCacheStatsBtn.addEventListener('click', updateCacheStats);
    cleanOldCacheBtn.addEventListener('click', cleanOldCache);
    clearAllCacheBtn.addEventListener('click', clearAllCache);

    // 添加测试缓存功能的按钮（调试用）
    window.testImageCache = async function() {
        console.log('🧪 开始测试缓存功能...');
        const testUrl = 'https://lain.bgm.tv/pic/cover/l/5c/9c/1_5B9cb.jpg'; // 一个测试图片
        try {
            const result = await imageCache.cacheImage(testUrl);
            console.log('🧪 测试结果:', result.startsWith('data:') ? '成功' : '失败');
            const stats = await imageCache.getCacheStats();
            console.log('🧪 当前缓存统计:', stats);
        } catch (error) {
            console.error('🧪 测试失败:', error);
        }
    };

    console.log('💡 要测试缓存功能，请在控制台运行: testImageCache()');


    // --- Bangumi Auth Logic ---
    function handleBangumiLogin() {
        const authUrl = `https://bgm.tv/oauth/authorize?client_id=${BGM_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(BGM_APP_REDIRECT_URI)}`;
        window.location.href = authUrl;
    }

    function handleBangumiLogout() {
        localStorage.removeItem('bgm_access_token');
        localStorage.removeItem('bgm_user_id');
        localStorage.removeItem('bgm_token_expires_at');
        localStorage.removeItem('bgm_username');
        localStorage.removeItem('bgm_nsfw_enabled');
        updateLoginStatusUI();
        alert('已从 Bangumi 登出。');
    }

    function storeAuthData(accessToken, userId, expiresIn) {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + parseInt(expiresIn, 10);
        localStorage.setItem('bgm_access_token', accessToken);
        localStorage.setItem('bgm_user_id', userId);
        localStorage.setItem('bgm_token_expires_at', expiresAt.toString());
        fetchBangumiUserDetails();
    }

    async function fetchBangumiUserDetails() {
        const token = localStorage.getItem('bgm_access_token');
        if (!token || isTokenExpired()) {
            updateLoginStatusUI();
            return;
        }
        try {
            const response = await fetch('https://api.bgm.tv/v0/me', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'TierMakerWebApp/1.0 (Frontend)'
                }
            });
            if (!response.ok) {
                if (response.status === 401) {
                    handleBangumiLogout();
                }
                throw new Error(`Failed to fetch user details: ${response.status}`);
            }
            const userData = await response.json();
            if (userData && userData.username) {
                localStorage.setItem('bgm_username', userData.nickname || userData.username);
            }
            updateLoginStatusUI();
        } catch (error) {
            console.error('Error fetching Bangumi user details:', error);
            updateLoginStatusUI();
        }
    }
    
    function isTokenExpired() {
        const expiresAt = localStorage.getItem('bgm_token_expires_at');
        if (!expiresAt) return true;
        return Math.floor(Date.now() / 1000) >= parseInt(expiresAt, 10);
    }

    function updateLoginStatusUI() {
        const token = localStorage.getItem('bgm_access_token');
        const username = localStorage.getItem('bgm_username');

        if (token && !isTokenExpired()) {
            bangumiLoginBtn.style.display = 'none';
            bangumiUserInfoDiv.style.display = 'flex';
            nsfwToggleDiv.style.display = 'flex';
            bangumiUsernameSpan.textContent = username || '用户'; 
            nsfwCheckbox.checked = localStorage.getItem('bgm_nsfw_enabled') === 'true';
        } else {
            bangumiLoginBtn.style.display = 'block';
            bangumiUserInfoDiv.style.display = 'none';
            nsfwToggleDiv.style.display = 'none';
            nsfwCheckbox.checked = false; 
            if (isTokenExpired() && token) { 
                 localStorage.removeItem('bgm_access_token');
                 localStorage.removeItem('bgm_user_id');
                 localStorage.removeItem('bgm_token_expires_at');
                 localStorage.removeItem('bgm_username');
            }
        }
    }

    function handleOAuthCallback() {
        if (window.location.hash.includes('access_token')) {
            const params = new URLSearchParams(window.location.hash.substring(1)); 
            const accessToken = params.get('access_token');
            const userId = params.get('user_id');
            const expiresIn = params.get('expires_in');

            if (accessToken && userId && expiresIn) {
                storeAuthData(accessToken, userId, expiresIn);
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            } else {
                console.error("OAuth callback missing required parameters in hash.");
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    }

    // --- NSFW Toggle Logic ---
    function handleNsfwToggle() {
        localStorage.setItem('bgm_nsfw_enabled', nsfwCheckbox.checked.toString());
    }

    // --- Initialize Auth and UI ---
    handleOAuthCallback(); 
    updateLoginStatusUI(); 
    if (localStorage.getItem('bgm_access_token') && !isTokenExpired() && !localStorage.getItem('bgm_username')) {
        fetchBangumiUserDetails();
    }

    // --- Event Listeners (New and Modified) ---
    bangumiLoginBtn.addEventListener('click', handleBangumiLogin);
    bangumiLogoutBtn.addEventListener('click', handleBangumiLogout);
    nsfwCheckbox.addEventListener('change', handleNsfwToggle);

    // --- Bangumi Search Functionality (Modified) ---
    async function searchBangumiGames(keyword) {
        if (!keyword || keyword.trim() === '') {
            bangumiResultsContainer.innerHTML = '<p>请输入搜索关键词。</p>';
            return;
        }
        bangumiResultsContainer.innerHTML = '<p>正在搜索中...</p>';

        const apiUrl = 'https://api.bgm.tv/v0/search/subjects';
        const requestBody = {
            keyword: keyword,
            filter: {
                type: [4] 
            }
        };

        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'TierMakerWebApp/1.0 (FrontendSearch)'
        };

        const accessToken = localStorage.getItem('bgm_access_token');
        const nsfwEnabled = localStorage.getItem('bgm_nsfw_enabled') === 'true';

        if (accessToken && !isTokenExpired() && nsfwEnabled) { 
            headers['Authorization'] = `Bearer ${accessToken}`;
            console.log("Searching with NSFW content enabled (token attached).");
        } else if (accessToken && !isTokenExpired() && !nsfwEnabled) {
            console.log("Searching with NSFW content disabled (token not attached despite login).");
        } else {
            console.log("Searching without authentication (not logged in or token expired).");
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(`Bangumi API 请求失败: ${response.status} - ${errorData.message || '未知错误'}`);
            }

            const data = await response.json();
            displayBangumiResults(data.data || []); 

        } catch (error) {
            console.error('Bangumi 搜索错误:', error);
            bangumiResultsContainer.innerHTML = `<p>搜索出错: ${error.message}</p>`;
        }
    }

    function displayBangumiResults(games) {
        bangumiResultsContainer.innerHTML = ''; 

        if (!games || games.length === 0) {
            bangumiResultsContainer.innerHTML = '<p>未找到相关游戏。</p>';
            return;
        }

        games.forEach(game => {
            if (!game.images || !game.name) return; 

            const itemDiv = document.createElement('div');
            itemDiv.classList.add('bangumi-result-item');
            itemDiv.title = `${game.name_cn || game.name}\n原名: ${game.name}\n日期: ${game.date || 'N/A'}`;

            const img = document.createElement('img');
            img.src = game.images.common || game.images.medium || game.images.large || game.images.grid;
            if (!img.src) { 
                console.warn('Game item skipped due to missing image:', game);
                return;
            }
            img.alt = game.name_cn || game.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = game.name_cn || game.name;
            
            itemDiv.appendChild(img);
            itemDiv.appendChild(nameSpan);

            const imageUrlForTier = game.images.large || game.images.common || game.images.medium;
            
            // Check if image is already added
            if (imageUrlForTier && isImageAlreadyAdded(imageUrlForTier)) {
                itemDiv.classList.add('added');
            }

            itemDiv.addEventListener('click', async () => {
                if (imageUrlForTier) {
                    if (!isImageAlreadyAdded(imageUrlForTier)) {
                        // 显示加载状态
                        itemDiv.style.opacity = '0.5';
                        itemDiv.style.pointerEvents = 'none';
                        
                        try {
                            // 缓存图片
                            console.log('🎯 点击添加Bangumi图片:', imageUrlForTier);
                            const cachedUrl = await imageCache.cacheImage(imageUrlForTier);
                            console.log('🔗 缓存结果URL:', cachedUrl.startsWith('data:') ? 'data URI (成功)' : '原始URL (失败)');
                            
                            // 使用缓存的URL创建图片元素
                            const newImageElement = createImageElement(cachedUrl);
                            
                            // 在元素上保存原始URL信息（用于后续识别）
                            const imgElement = newImageElement.querySelector('img');
                            if (imgElement) {
                                imgElement.dataset.originalUrl = imageUrlForTier;
                                imgElement.dataset.cached = 'true';
                            }
                            
                            imagePool.appendChild(newImageElement);
                            itemDiv.classList.add('added');
                            
                            // 显示成功提示
                            console.log('Bangumi图片添加并缓存成功');
                            
                        } catch (error) {
                            console.error('添加Bangumi图片失败:', error);
                            alert('添加图片失败，请重试。');
                        } finally {
                            // 恢复UI状态
                            itemDiv.style.opacity = '';
                            itemDiv.style.pointerEvents = '';
                        }
                    } else {
                        alert('这张图片已经添加过了！');
                    }
                } else {
                    alert('无法获取此游戏的图片用于添加。');
                }
            });
            bangumiResultsContainer.appendChild(itemDiv);
        });
    }
    
    bangumiSearchBtn.addEventListener('click', () => {
        const searchTerm = bangumiSearchInput.value;
        searchBangumiGames(searchTerm);
    });
    
    bangumiSearchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const searchTerm = bangumiSearchInput.value;
            searchBangumiGames(searchTerm);
        }
    });
    
    // Initial Load
    loadTiers(); 
}); 
