document.addEventListener('DOMContentLoaded', () => {
  console.log('emoji.js loaded');

  // ====================================
  // Emoji Picker Logic (unchanged)
  // ====================================
  const emojiButtons = document.querySelectorAll('.emoji-btn');
  const emojiPickers = document.querySelectorAll('emoji-picker');

  if (emojiButtons.length === 0) {
    console.error('No .emoji-btn elements found');
  }
  if (emojiPickers.length === 0) {
    console.error('No emoji-picker elements found');
  }

  emojiButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const wrapper = btn.closest('.emoji-input-wrapper');
      if (!wrapper) {
        console.error('No .emoji-input-wrapper found for button', btn);
        return;
      }
      const picker = wrapper.nextElementSibling;
      if (!picker || !picker.matches('emoji-picker')) {
        console.error('No emoji-picker found after wrapper', wrapper);
        return;
      }
      document.querySelectorAll('emoji-picker.active').forEach(p => p.classList.remove('active'));
      picker.classList.toggle('active');
      console.log('Toggled emoji picker for button', btn);
    });
  });

  emojiPickers.forEach(picker => {
    picker.addEventListener('emoji-click', e => {
      const wrapper = picker.previousElementSibling;
      if (!wrapper) {
        console.error('No wrapper found before picker', picker);
        return;
      }
      const input = wrapper.querySelector('input, textarea');
      if (!input) {
        console.error('No input/textarea found in wrapper', wrapper);
        return;
      }
      input.value += e.detail.unicode;
      picker.classList.remove('active');
      console.log('Inserted emoji', e.detail.unicode, 'into', input);
    });
  });

  // Close picker when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.emoji-btn') && !e.target.closest('emoji-picker')) {
      document.querySelectorAll('emoji-picker.active').forEach(p => p.classList.remove('active'));
      console.log('Closed all emoji pickers');
    }
  });

  // ====================================
  // Category Dropdown Logic
  // ====================================
  const categorySelects = document.querySelectorAll('#category, #edit-category');
  categorySelects.forEach(select => {
    const form = select.closest('.task-form, .modal');
    const customInput = form.querySelector(select.id === 'category' ? '#custom-category' : '#edit-custom-category');

    select.addEventListener('change', () => {
      if (select.value === 'Custom') {
        customInput.style.display = 'block';
        customInput.classList.add('visible');
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        customInput.classList.remove('visible');
        customInput.value = '';
      }
    });
  });

  console.log('Attaching Add/Edit listeners');

  // ====================================
  // Add Task Logic (fixed for custom categories)
  // ====================================
  document.querySelector('#addTaskBtn').addEventListener('click', (e) => {
    e.preventDefault();
    console.log("✅ Add Task button clicked");

    const categorySelect = document.querySelector('#category');
    const customCategory = document.querySelector('#custom-category');

    // Validate custom category if selected
    if (categorySelect.value === 'Custom' && !customCategory.value.trim()) {
      alert("Please enter a custom category before saving the task.");
      return;
    }

    const task = {
      startTime: document.querySelector('#startTime').value,
      endTime: document.querySelector('#endTime').value,
      taskName: document.querySelector('#taskName').value,
      // ✅ If custom is chosen, save what user typed instead of "Custom"
      category: categorySelect.value === 'Custom' ? customCategory.value.trim() : categorySelect.value,
      priority: document.querySelector('#priority').value
    };

    console.log('Add Task:', task); // Replace with save logic (push to array, localStorage, then call renderTasks)
  });

  // ====================================
  // Edit Task Logic (fixed for custom categories)
  // ====================================
  document.querySelector('#saveEditBtn').addEventListener('click', (e) => {
    e.preventDefault();
    console.log("✅ Edit Task button clicked");

    const categorySelect = document.querySelector('#edit-category');
    const customCategory = document.querySelector('#edit-custom-category');

    // Validate custom category if selected
    if (categorySelect.value === 'Custom' && !customCategory.value.trim()) {
      alert("Please enter a custom category before saving the task.");
      return;
    }

    const task = {
      startTime: document.querySelector('#edit-startTime').value,
      endTime: document.querySelector('#edit-endTime').value,
      taskName: document.querySelector('#edit-taskName').value,
      category: categorySelect.value === 'Custom' ? customCategory.value.trim() : categorySelect.value,
      priority: document.querySelector('#edit-priority').value,
      index: document.querySelector('#editTaskIndex').value
    };

    console.log('Edit Task:', task); // Replace with save logic (update array/localStorage, then call renderTasks)
  });

}); // closes DOMContentLoaded
