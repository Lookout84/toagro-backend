import puppeteer, { Browser, Page } from 'puppeteer';

describe('Listings E2E Tests', () => {
  let browser: Browser;
  let page: Page;
  
  // Test credentials
  const user = {
    email: 'e2e-test@example.com',
    password: 'TestPassword123',
    name: 'E2E Test User',
  };
  
  // Set up the browser and page before tests
  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
  });

  // Close the browser after tests
  afterAll(async () => {
    await browser.close();
  });

  // Helper function to login
  async function login() {
    await page.goto('http://localhost:3000/login');
    await page.type('input[name="email"]', user.email);
    await page.type('input[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  }

  it('should display listings on the homepage', async () => {
    await page.goto('http://localhost:3000');
    
    // Check if listings are loaded
    await page.waitForSelector('.listing-card', { timeout: 5000 });
    const listingCards = await page.$$('.listing-card');
    
    expect(listingCards.length).toBeGreaterThan(0);
  });

  it('should allow searching for listings', async () => {
    await page.goto('http://localhost:3000');
    
    // Enter search term
    await page.type('input[name="search"]', 'wheat');
    await page.click('button[type="submit"]');
    
    // Wait for search results
    await page.waitForSelector('.listing-card', { timeout: 5000 });
    
    // Check if search results contain the term
    const searchResults = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.listing-card .title')).map(el => el.textContent);
      return titles;
    });
    
    expect(searchResults.some(title => title?.toLowerCase().includes('wheat'))).toBeTruthy();
  });

  it('should allow creating a new listing when logged in', async () => {
    await login();
    
    // Navigate to create listing page
    await page.goto('http://localhost:3000/listings/create');
    
    // Fill in the form
    await page.type('input[name="title"]', 'E2E Test Listing');
    await page.type('textarea[name="description"]', 'This is a test listing created by E2E test.');
    await page.type('input[name="price"]', '100');
    await page.type('input[name="location"]', 'Test Location');
    await page.select('select[name="category"]', 'grains');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Wait for redirect to listing page
    await page.waitForNavigation();
    
    // Check if listing was created
    const titleElement = await page.$('h1');
    const title = await page.evaluate(el => el?.textContent, titleElement);
    
    expect(title).toBe('E2E Test Listing');
  });

  it('should allow editing a listing', async () => {
    await login();
    
    // Navigate to user listings
    await page.goto('http://localhost:3000/user/listings');
    
    // Click on edit button of the first listing
    await page.click('.listing-card .edit-button');
    
    // Wait for edit form
    await page.waitForSelector('form');
    
    // Update the title
    await page.evaluate(() => {
      (document.querySelector('input[name="title"]') as HTMLInputElement).value = '';
    });
    await page.type('input[name="title"]', 'Updated E2E Test Listing');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Wait for redirect to listing page
    await page.waitForNavigation();
    
    // Check if listing was updated
    const titleElement = await page.$('h1');
    const title = await page.evaluate(el => el?.textContent, titleElement);
    
    expect(title).toBe('Updated E2E Test Listing');
  });

  it('should allow deleting a listing', async () => {
    await login();
    
    // Navigate to user listings
    await page.goto('http://localhost:3000/user/listings');
    
    // Count initial listings
    const initialListings = await page.$$('.listing-card');
    const initialCount = initialListings.length;
    
    // Click on delete button of the first listing
    await page.click('.listing-card .delete-button');
    
    // Confirm deletion in modal
    await page.waitForSelector('.delete-modal');
    await page.click('.delete-modal .confirm-button');
    
    // Wait for page to refresh
    await page.waitForTimeout(1000);
    
    // Count listings after deletion
    const remainingListings = await page.$$('.listing-card');
    
    expect(remainingListings.length).toBe(initialCount - 1);
  });
});