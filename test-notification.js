// Test script to manually trigger journal reminder notification
// Run this in browser console or via curl

const testNotification = async () => {
  try {
    const response = await fetch('/api/cron/journal-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    console.log('Notification created:', data);
    alert('Test notification created! Check the bell icon in the header.');
  } catch (error) {
    console.error('Error:', error);
    alert('Error creating notification. Check console.');
  }
};

testNotification();
