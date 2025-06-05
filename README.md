# TierMaker Project

This is a simple web application that allows users to create tier lists by uploading images and dragging them into customizable tiers.

## Features

- **Dynamic Tiers**: Add, remove, rename, and reorder tiers.
- **Customizable Tier Labels**: Change the color of tier labels.
- **Image Upload**: Upload images from your local computer to an image pool.
- **Drag and Drop**: Easily drag images from the pool to tiers, between tiers, or back to the pool.
- **Local Storage Persistence**: Your tier list configuration and image placements are saved in your browser's local storage, so your work persists across sessions.

## How to Use

1.  Open `index.html` in your web browser.
2.  **Add Tiers**: Click the "添加级别" (Add Tier) button to create new tiers. Initially, some default tiers (A, A-, B+, B, C) are created.
3.  **Manage Tiers**:
    - Click on a tier label to rename it.
    - Use the arrow buttons (▲/▼) next to each tier to move it up or down.
    - Use the palette button (🎨) to change the tier label's background color.
    - Use the cross button (✕) to delete a tier. Images in a deleted tier will be moved back to the image pool.
4.  **Upload Images**: Click the "上传图片" (Upload Images) button to select image files from your computer. Uploaded images will appear in the "固定图片" (Pinned Images) section at the bottom.
5.  **Rank Images**: Drag images from the "固定图片" pool and drop them into your desired tiers.
    - You can also drag images between different tiers or drag an image from a tier back to the image pool.

## Deployment

This application is built with HTML, CSS, and vanilla JavaScript. It can be easily deployed to static site hosting services like GitHub Pages or Deno Deploy.

### GitHub Pages

1.  Ensure your project is a GitHub repository.
2.  Go to your repository's settings.
3.  Navigate to the "Pages" section.
4.  Choose the branch to deploy from (e.g., `main` or `gh-pages`) and the `/ (root)` folder.
5.  Your site will be deployed to `https://<your-username>.github.io/<repository-name>/`.

### Deno Deploy

1.  Sign up/log in to Deno Deploy.
2.  Create a new project and link it to your GitHub repository containing this project.
3.  Deno Deploy will automatically detect the `index.html` file and deploy it.

## Files

-   `index.html`: The main HTML structure of the application.
-   `style.css`: Contains all the styles for the application.
-   `script.js`: Handles all the application logic, including tier management, image handling, drag and drop, and local storage. 