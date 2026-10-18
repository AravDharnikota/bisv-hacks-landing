/**
 * BISV Hacks registration. A Google Apps Script web app that lives inside one Google Sheet.
 * register.html posts one JSON object per applicant. This script checks it and appends one row.
 *
 * Sheet tabs:
 *   Registrations   one row per applicant. The header row is written by setup().
 *
 * Setup is in the README ("Registration"). Short version:
 *   1. New Google Sheet -> Extensions -> Apps Script. Paste this file over Code.gs. Save.
 *   2. Run setup() once. Approve the permissions.
 *   3. Deploy -> New deployment -> Web app. Execute as: Me. Who has access: Anyone. Copy the /exec URL.
 *   4. Paste the URL into data-endpoint="" on the form in register.html. Push.
 * After you change this file: Deploy -> Manage deployments -> Edit -> Version: New version.
 */

const SHEET = 'Registrations';
const CONTACT = 'bisvhackathon@gmail.com';
const MAX_TEAM = 4;

// Set to true to email each applicant a confirmation from the account that deployed this script.
// Free Google accounts can send about 100 emails a day through Apps Script. Registration still
// saves if the email fails.
const SEND_CONFIRMATION = false;

const HEADER = ['When', 'Full name', 'Grade', 'Age', 'School', 'Email', 'Phone', 'Dietary restrictions', 'Parent/guardian email', 'Something they built', 'Has a team', 'Teammate emails', 'Status'];

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/* --- Web entry points ----------------------------------------------------- */

function doPost(e) {
  let out;
  try {
    out = register(JSON.parse(e.postData.contents));
  } catch (err) {
    console.error(err);
    out = { error: 'Registration is down for a moment. Try again in a minute, or email ' + CONTACT + '.' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('BISV Hacks registration is running.');
}

/* --- One application ------------------------------------------------------ */

function register(body) {
  // Bots fill the hidden "website" field. Pretend it worked so they stop.
  if (body.website) return { ok: true };

  const row = check(body);
  if (row.error) return row;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET) || setup();
    if (alreadyRegistered(sheet, row.email)) {
      return { error: row.email + ' is already registered. To change anything, email ' + CONTACT + '.' };
    }
    sheet.appendRow([
      new Date(), row.name, row.grade, row.age, row.school, row.email, row.phone, row.diet,
      row.parentEmail, row.built, row.hasTeam, row.teamEmails.join(', '), 'new',
    ]);
  } finally {
    lock.releaseLock();
  }

  if (SEND_CONFIRMATION) confirm(row);
  return { ok: true };
}

// Cleans every field and returns either { error } or the row to save.
function check(body) {
  const name = clean(body.name, 120);
  const grade = clean(body.grade, 10);
  const age = Number(clean(body.age, 3));
  const school = clean(body.school, 160);
  const email = clean(body.email, 120).toLowerCase();
  const phone = clean(body.phone, 30);
  const diet = clean(body.diet, 200) || 'None';
  const parentEmail = clean(body.parentEmail, 120).toLowerCase();
  const built = clean(body.built, 800);
  const hasTeam = clean(body.hasTeam, 3) === 'Yes' ? 'Yes' : 'No';
  const teamEmails = hasTeam === 'Yes' && Array.isArray(body.teamEmails)
    ? body.teamEmails.map(e => clean(e, 120).toLowerCase()).filter(Boolean).slice(0, MAX_TEAM)
    : [];

  if (name.length < 2) return { error: 'Your name is missing.' };
  if (!['9th', '10th', '11th', '12th'].includes(grade)) return { error: 'Pick a grade.' };
  if (!Number.isInteger(age) || age < 12 || age > 20) return { error: 'Your age does not look right. Email ' + CONTACT + ' if it is.' };
  if (school.length < 2) return { error: 'Your school is missing.' };
  if (!EMAIL.test(email)) return { error: 'Your email does not look right.' };
  if ((phone.match(/\d/g) || []).length < 7) return { error: 'Your phone number does not look right.' };
  if (!EMAIL.test(parentEmail)) return { error: 'The parent or guardian email does not look right.' };
  if (built.length < 20) return { error: 'Tell us a little more about what you built.' };
  if (hasTeam === 'Yes') {
    if (!teamEmails.length) return { error: 'Add at least one teammate.' };
    for (const t of teamEmails) {
      if (!EMAIL.test(t)) return { error: t + ' does not look like an email.' };
      if (t === email) return { error: 'The team list has your own email in it.' };
    }
    if (new Set(teamEmails).size !== teamEmails.length) return { error: 'A teammate is listed twice.' };
  }

  return { name, grade, age, school, email, phone, diet, parentEmail, built, hasTeam, teamEmails };
}

function alreadyRegistered(sheet, email) {
  if (sheet.getLastRow() < 2) return false;
  const col = HEADER.indexOf('Email') + 1;
  const hit = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).createTextFinder(email).matchEntireCell(true).findNext();
  return Boolean(hit);
}

function confirm(row) {
  try {
    MailApp.sendEmail({
      to: row.email,
      replyTo: CONTACT,
      subject: 'You are registered for BISV Hacks 2027',
      body:
        'Hi ' + row.name.split(/\s+/)[0] + ',\n\n' +
        'We have your application for BISV Hacks 2027. Watch this inbox and the Discord (https://discord.gg/T8cuesaNKB) for the date, the schedule, and what to bring.\n\n' +
        'If anything in your application needs to change, reply to this email.\n\n' +
        'BISV Hacks\nhttps://bisvhacks.com',
    });
  } catch (err) {
    console.error('Confirmation email failed: ' + err);
  }
}

/* --- Helpers ---------------------------------------------------------------- */

// One line of plain text, trimmed and capped. Newlines in the long answer become spaces around " / ".
function clean(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\r?\n+/g, ' / ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* --- Run once ------------------------------------------------------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
    // Emails and phone numbers stay text, so a leading + or 0 is not lost.
    sheet.getRange('F:G').setNumberFormat('@');
    sheet.getRange('I:I').setNumberFormat('@');
    sheet.getRange('L:L').setNumberFormat('@');
  }
  return sheet;
}

// Run this in the editor after setup() to confirm the sheet gets a row. Delete the row after.
function testRegister() {
  const out = register({
    name: 'Test Student', grade: '11th', age: 16, school: 'BASIS Independent Silicon Valley',
    email: 'test+' + Date.now() + '@example.com', phone: '(408) 555-0123', diet: '',
    parentEmail: 'parent@example.com', built: 'A weather station from a Raspberry Pi that posts readings to a website I made.',
    hasTeam: 'Yes', teamEmails: ['friend@example.com'],
  });
  console.log(JSON.stringify(out));
}
