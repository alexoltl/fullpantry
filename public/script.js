function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.style.display = 'none';  // Hide all tab contents
    });
    document.getElementById(tabName).style.display = 'block';  // Show selected tab

    const buttons = document.querySelectorAll('.tabs button');
    buttons.forEach(button => {
        button.classList.remove('active');  // Remove active class from all buttons
    });
    event.target.classList.add('active');  // Add active class to the clicked button
}

// Show dinner tab by default
document.addEventListener('DOMContentLoaded', () => {
    showTab('dinner');  // Default to showing dinner recipes
});
