// What actions this `timetable_view_page` performs
// 1. Selects the recent semester
// 2. Compacts the time table into a viewable format which is easier to see. 
// TODO: add colors to the table 
// TODO: A toggle switch for the timetable view
// TODO: add a simple toggle switch for the auto view button


const change_time_table = () => {
  const parent_table = document.getElementById("timeTableStyle");
  if (parent_table === null || parent_table === undefined || parent_table.children.length === 0) return;
  
  const tbody_table = parent_table.children[0];// the first element is the <tbody> with data
  const extractedHeader = extract_header(tbody_table.children);
  const extracted_children = extract_tbody_data(tbody_table.children);
  const merged_data = filterRepeatedColumns(extractedHeader, extracted_children)
  const childrenDataArr = merged_data;
  saveTimeTable(extractedHeader, childrenDataArr);
  displayTableData(extractedHeader, childrenDataArr)
};

function displayTableData(headerData, childrenData) {
  headerData = [...new Set(headerData)];
  // creating the table head
  headerData.splice(0, 1); // remove the first element which is just "starttime-endtime[1,4,9,16,25];"

  const table = createTable(headerData, childrenData);
  insertTable(table, headerData, childrenData); //insertTable(table);
}

function createTable(header, bodyData) {
  const tdHeader = createTableHead(filterRepeated(header));
  const table = document.createElement("table"); table.className = "styled-table";
  table.appendChild(tdHeader);
  const tBody = document.createElement("tbody");
  const dayIndex = (new Date()).getDay();
  for (let i = 0; i < bodyData.length; i++) {
    let { day, theory: theoryDataArr, lab: labDataArr } = bodyData[i];
    theoryDataArr.splice(0, 1); // remove the first element which is just starttime-endtime 
    labDataArr.splice(0, 1); // remove the first element which is just starttime-endtime
    const tr = createTr(theoryDataArr, labDataArr);
    const day_td = _create_td_element(day, "day-block");
    tr.insertBefore(day_td, tr.children[0]);
    if (dayIndex == toIndex(day)) {
      tr.classList.add("current-day");
    }
    tBody.appendChild(tr);
  }
  table.appendChild(tBody);
  const table_div = document.createElement("div");
  table_div.className = "table-div";
  table_div.appendChild(table);
  return table_div;
}

function toIndex(day) {
  if (day === "MON") return 1;
  if (day === "TUE") return 2;
  if (day === "WED") return 3;
  if (day === "THU") return 4;
  if (day === "FRI") return 5;
  if (day === "SAT") return 6;
  return 0;
}

function insertTable(table_div, headerData, childrenData) {
  // getting the actual div of the timetable
  const timeTableLoader = document.getElementById("loadMyFragment");
  const parent_div = timeTableLoader.parentElement;
  // remove the previous table and download link if it exists
  document.querySelectorAll(".table-div").forEach((div) => { div.remove() });
  document.querySelectorAll(".download-timetable").forEach((a) => a.remove());
  // create a new table div and add the table to it
  parent_div.insertBefore(table_div, timeTableLoader);
  
  //newly add code in insertTable
  const csvData = generateCSV(headerData, childrenData);// Generate CSV data for the timetable
   const csvDownloadLink = createDownloadLink("download-timetable", csvData, "timetable.csv", "text/calendar");
 /* parent_div.insertBefore(csvDownloadLink, table_div); */
  
  const temp = document.createElement("h1"); // this is just to create a space before table_div
   temp.textContent = "."; 
   temp.style.color="white";
parent_div.insertBefore(temp, table_div);


  // Generate ICS (iCalendar) data for scheduling events
  const icsData = generateICSFromCSV(csvData);
  const icsDownloadLink = createDownloadLink("download-timetable", icsData, "timetable.ics", "text/calendar");
  parent_div.insertBefore(icsDownloadLink, table_div); // Insert ICS download link
  addUserGuideOption(icsDownloadLink); //Insert user Guide
  
  const a = create_download_link("download-timetable");
  domtoimage.toPng(table_div, { quality: 0.99 }).then(
    (blob) => {
      a.download = 'timetable.png';
      a.href = blob;
    }
  );
  parent_div.insertBefore(a, table_div);
  
}

const MutationObserverConfig = { attributes: true, childList: true, subtree: true };

chrome.runtime.onMessage.addListener((request) => {
  if (request.message === "timetable_view_page") {
    try {
      // try to display the timetable data if it exists 
      getTimeTable((d) => {
        displayTableData(d.header, d.data)
      });

      // attaching the observer to the div
      const timeTableDiv = document.getElementById("loadMyFragment");
      const timeTableDivObserver = new MutationObserver((mutationsList, observer) => change_time_table());
      timeTableDivObserver.observe(timeTableDiv, MutationObserverConfig);
    } catch (error) {
      // console.log(error);
      console.error(error)
    }
  }
});


// Function to generate CSV content from the timetable data
function generateCSV(headerData, childrenData) {
  let csvContent = "Day," + headerData.join(",") + "\n"; // Add the headers
  childrenData.forEach(({ day, theory, lab }) => {
    const row = [day, ...theory.map((t, idx) => `${t} / ${(lab[idx] || "")}`)]; // Combine theory and lab data
    csvContent += row.join(",") + "\n";
  });
  return csvContent;
}
// Function to create an event name from the schedule data
function createEventName(event, rename = false) {
  let match = event.match(/([A-Z]+\d{4})/); // Match course code (e.g., CSE1002)
  if (match) match = match[1];
  if (rename && match) match = newNames[match[1]]; // Use match[1] as key
  let venueMatch;
  if (event.includes("ONL-ALL")) {
    venueMatch = "Online";
  } else {
    venueMatch = event.match(/(?:TH|LA)-(.*?)-ALL/); // Match venue
  }

  if (match && venueMatch) {
    if (typeof venueMatch === "string") {
      return `${match} ${venueMatch}`; // If venueMatch is "Online"
    } else if (venueMatch[1]) {
      return `${match} ${venueMatch[1]}`; // If venueMatch is a match object
    }
  }
  return null; // Return null if no valid name is found
}


// Function to generate ICS data from CSV data for calendar integration
function generateICSFromCSV(csvData, rename = false) {
  const daysToOffsets = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 }; // Days of the week mapped to offsets
  const today = new Date();
  const previousMonday = new Date(today.setDate(today.getDate() - ((today.getDay() + 6) % 7))); // Get the previous Monday's date
  const lines = csvData.trim().split("\n");
  const header = lines[0].split(",").slice(1); // Extract the header
  const schedule = lines.slice(1).map((line) => line.split(",")); // Extract the schedule data

  let calendarContent = `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
NAME:Classes
X-WR-CALNAME:Classes`;

  schedule.forEach((row) => {
    const day = row[0].trim().toUpperCase(); // Get the day from each row
    const offset = daysToOffsets[day];
    if (offset === undefined) return; // Skip if day is invalid

    const eventDate = new Date(previousMonday);
    eventDate.setDate(previousMonday.getDate() + offset); // Calculate the event date

    let previousEvent = null;
    let previousStartTime = null;
    let previousEndTime = null;

    row.slice(1).forEach((event, index) => {
      if (!event || event.trim() === "-" || event.trim().length < 8) return;
      if(header[index]==="Lunch - Lunch") return;
      const timeRange = header[index].split("-").map((t) => t.trim()); // Extract start and end times
      if (!timeRange || timeRange.length !== 2) return;

      const [startTime, endTime] = timeRange;
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);
      
      if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
        console.error("Invalid time values:", { startHour, startMinute, endHour, endMinute });
        return;
      }
      
      const startDateTime = new Date(eventDate);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(eventDate);
      endDateTime.setHours(endHour, endMinute, 0, 0);

      const eventName = createEventName(event.trim(), rename);
      console.log(eventName);
      if (!eventName) return;

      if (previousEvent === eventName) {
        previousEndTime = endDateTime;
      } else {
        if (previousEvent) {
          calendarContent += `
BEGIN:VEVENT
DTSTART:${formatDateTime(previousStartTime)}
DTEND:${formatDateTime(previousEndTime)}
SUMMARY:${previousEvent}
DESCRIPTION:Scheduled Event
RRULE:FREQ=WEEKLY;INTERVAL=1
BEGIN:VALARM
TRIGGER:-PT10M
ACTION:DISPLAY
DESCRIPTION:Reminder
END:VALARM
END:VEVENT`;
        }

        previousEvent = eventName;
        previousStartTime = startDateTime;
        previousEndTime = endDateTime;
      }
    });

    if (previousEvent) {
      calendarContent += `
BEGIN:VEVENT
DTSTART:${formatDateTime(previousStartTime)}
DTEND:${formatDateTime(previousEndTime)}
SUMMARY:${previousEvent}
DESCRIPTION:Scheduled Event
RRULE:FREQ=WEEKLY;INTERVAL=1
BEGIN:VALARM
TRIGGER:-PT10M
ACTION:DISPLAY
DESCRIPTION:Reminder
END:VALARM
END:VEVENT`;
    }
  });

  calendarContent += `
END:VCALENDAR`;
  return calendarContent;
}

// Function to format the date and time into the correct ISO format for ICS
function formatDateTime(date) {
     if (!(date instanceof Date) || isNaN(date)) {
       console.error("Invalid date:", date);
       return null; // or handle the error appropriately
     }
     return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
   }

// Function to create a download link for files (CSV, ICS, PNG)
function createDownloadLink(className, data, filename, type = "text/plain") {
  const blob = data ? new Blob([data], { type }) : null;
  const url = blob ? URL.createObjectURL(blob) : null;
  let definition = "";
  const downloadLink = document.createElement("a");
  let icon = "&#xf019;"; // Default icon (for CSV)

  // Define icons and description for specific file types
  if (filename === "timetable.ics") {
    icon = "&#x1F4C6;"; // Calendar icon for ICS
    definition = " (used to schedule all classes automatically)";
  }
  if (filename === "timetable.png") {
    icon = "&#x1F5BC;"; // Image icon for PNG
  }

  // Set class and inner HTML for the download link
  downloadLink.className = className;
  downloadLink.innerHTML = `<i style="font-size: 24px" class="fa">${icon}</i> Download ${filename}${definition}`;
  
  // Validate URL and filename
  if (!url || !filename) {
    console.error("Invalid URL or filename for download link:", { url, filename });
    return downloadLink; // Return without further modification
  }

  if (filename === "timetable.ics") {
    downloadLink.addEventListener(
      "click",
      async (e) => {
        e.preventDefault();
        const userConfirmed = confirm("Do you need customization in the schedule? Click 'OK' for Yes and 'Cancel' for No.");
        if (userConfirmed) {
          const modifiedICS = promptForCourseNames(data); // Allow user to modify ICS data
          if (modifiedICS) {
            const modifiedBlob = new Blob([modifiedICS], { type });
            const modifiedUrl = URL.createObjectURL(modifiedBlob);
             downloadLink.download = "timetable.ics";
            downloadLink.href = modifiedUrl;
            downloadLink.click(); // Trigger download
          }
        } else {
          downloadLink.download = filename;
          downloadLink.href = url;
          downloadLink.click();
        }
      },
      { once: true }
    );
  } else {
    downloadLink.download = filename;
    downloadLink.href = url;
  }

  return downloadLink;
}


// Function to prompt the user to modify course names in ICS data
function promptForCourseNames(data) {
  const newNames = {};
  const lines = data.trim().split("\n");
  const newTime = prompt("Reminder before time (in minutes):");

  const updatedLines = lines.map((line) => {
    const parts = line.split(",");
    const updatedParts = parts.map((course) => {
      // Match and update TRIGGER time
      const alertMatch = course.match(/TRIGGER:-PT(\d+)M/);
      if (alertMatch) {
        course = course.replace(/TRIGGER:-PT\d+M/, `TRIGGER:-PT${newTime}M`);
      }

      // Match and update course name
      const courseNameMatch = course.match(/([A-Z]{3}\d{4})/);
      if (courseNameMatch) {
        const originalName = courseNameMatch[0];
        if (!newNames[originalName]) {
          const newName = prompt(
            `Edit course name for "${originalName}" (Leave blank to keep unchanged):`,
            originalName
          );
          newNames[originalName] = newName || originalName; // Save the new name or keep the original
        }
        return course.replace(originalName, newNames[originalName]);
      }

      return course; // Return unchanged course data
    });

    return updatedParts.join(",");
  });

  return updatedLines.join("\n");
}



// Function to create a User Guide popup
function createUserGuidePopup() {
  // Create the modal container
  const modal = document.createElement("div");
  modal.id = "userGuideModal";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";
  modal.style.zIndex = "1000";

  // Create the modal content
  const modalContent = document.createElement("div");
  modalContent.style.backgroundColor = "white";
  modalContent.style.padding = "20px";
  modalContent.style.borderRadius = "8px";
  modalContent.style.maxWidth = "600px";
  modalContent.style.width = "90%";
  modalContent.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";

  // Add content to the modal
  modalContent.innerHTML = `
    <h1>User Guide</h1>
    <h3>How to Import Calendar</h3>
    <ol>
      <li>Download the ICS file by clicking the link.</li>
      <li>Go to <a href="https://calendar.google.com" target="_blank">calendar.google.com</a> and log in with your Gmail account.</li>
      <li>Click on the gear icon and go to "Settings".</li>
      <li>Navigate to "Import & Export" options.</li>
      <li>In the "Import" section, click "Select file from your computer" and upload the downloaded ICS file.</li>
      <li>Click "Import" to add the events to your calendar.</li>
      
      <li>Now you can also able add widgets in you phone from Google calander<li>
    </ol>
    <h3>How to Verify Notification Timings</h3>
    <p><strong>Note:</strong> By default, event notifications are set to 30 minutes before the event. Please verify and change it as required:</p>
    <ol>
      <li>In Google Calendar, go to "Settings".</li>
      <li>Select your name under the "Settings for my calendars" menu.</li>
      <li>In the "Event notifications" section, update the timing to suit your needs.</li>
    </ol>
    <h3>How to Delete the Calendar</h3>
    <p>To remove the calendar:</p>
    <ol>
      <li>In the "Settings for my calendars" menu, select your email account.</li>
      <li>Scroll down and look for the "Remove calendar" or "Delete" option.</li>
    </ol>
    <button id="closeUserGuide" style="margin-top: 20px; padding: 10px 20px; background: #007BFF; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Add close functionality
  document.getElementById("closeUserGuide").addEventListener("click", () => {
    modal.remove();
  });
}

// Add the User Guide link next to the ICS link
function addUserGuideOption(parentElement) {
  const guideLink = document.createElement("a");
  guideLink.href = "#";
  guideLink.textContent = "User Guide";
  guideLink.style.marginLeft = "10px";
  guideLink.style.color = "#007BFF";
  guideLink.style.cursor = "pointer";
  guideLink.addEventListener("click", (e) => {
    e.preventDefault();
    createUserGuidePopup();
  });
  parentElement.appendChild(guideLink);
                                                   }
