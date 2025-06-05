document.addEventListener('DOMContentLoaded', () => {
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
    const BGM_APP_REDIRECT_URI = 'http://localhost:8000/api/auth/bangumi/callback'; 

    let tiers = [];
    let nextTierId = 0;
    let draggedImage = null;

    const defaultTiers = [
        { name: 'A', color: '#ff7f7f' },
        { name: 'A-', color: '#ffbf7f' },
        { name: 'B+', color: '#ffff7f' },
        { name: 'B', color: '#bfff7f' },
        { name: 'C', color: '#7fff7f' }
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
                    if (!Array.from(imagePool.children).some(img => img.src === imgSrc)) {
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
        const img = document.createElement('img');
        img.src = src;
        img.classList.add('draggable-image');
        img.draggable = true;
        img.addEventListener('dragstart', dragStart);
        img.addEventListener('dragend', dragEnd);
        return img;
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
        draggedImage = event.target;
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

            if (targetTier) {
                if (sourceTierElement) {
                    const sourceTierId = parseInt(sourceTierElement.dataset.tierId);
                    const sourceTier = tiers.find(t => t.id === sourceTierId);
                    if (sourceTier) {
                        sourceTier.images = sourceTier.images.filter(img => img !== draggedImage.src);
                    }
                }
                
                if (!targetTier.images.includes(draggedImage.src)) {
                     targetTier.images.push(draggedImage.src);
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
            if (sourceTierElement) { 
                const sourceTierId = parseInt(sourceTierElement.dataset.tierId);
                const sourceTier = tiers.find(t => t.id === sourceTierId);
                if (sourceTier) {
                    sourceTier.images = sourceTier.images.filter(img => img !== draggedImage.src);
                }
                draggedImage.remove(); 
                
                if (!Array.from(imagePool.children).some(img => img.src === draggedImage.src)) {
                    imagePool.appendChild(draggedImage);
                }
                saveTiers();
                renderTiers(); 
            } else {
                if (!imagePool.contains(draggedImage)) {
                    imagePool.appendChild(draggedImage);
                }
            }
            draggedImage.classList.remove('dragging');
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

    // Event Listeners
    addTierBtn.addEventListener('click', () => addNewTier());
    imageUploadInput.addEventListener('change', handleImageUpload);
    
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

            itemDiv.addEventListener('click', () => {
                const imageUrlForTier = game.images.large || game.images.common || game.images.medium;
                if (imageUrlForTier) {
                    const newImageElement = createImageElement(imageUrlForTier);
                    imagePool.appendChild(newImageElement);
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