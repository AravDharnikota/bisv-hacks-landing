// Typing effect for hero section
const heroText = document.querySelector('#hero h1');
const text = "BASIS Independent Silicon Valley<br>Hackathon 2026"; // Keep the line break

let index = 0;

function typeEffect() {
    if (text.charAt(index) === "<") {
        // If encounter an HTML tag, insert the whole tag
        let htmlTag = "";
        while (text.charAt(index) !== ">") {
            htmlTag += text.charAt(index);
            index++;
        }
        htmlTag += text.charAt(index); // Add the closing ">"
        heroText.innerHTML += htmlTag;
        index++; // Move past ">"
    } else {
        // Append normal characters one by one
        heroText.innerHTML += text.charAt(index);
        index++;
    }

    if (index < text.length) {
        setTimeout(typeEffect, 50); // Adjust typing speed here
    }
}

window.onload = typeEffect;

// JavaScript to toggle FAQ answers and arrow direction
document.querySelectorAll('.faq-item h3').forEach(item => {
    item.addEventListener('click', () => {
        const answer = item.nextElementSibling;

        // Toggle the 'active' class on both the question and the answer
        answer.classList.toggle('active');
        item.classList.toggle('active');

        // Smooth toggle effect for the answer
        if (answer.style.maxHeight) {
            answer.style.maxHeight = null;
        } else {
            answer.style.maxHeight = answer.scrollHeight + "px";
        }
    });
});

// Mobile hamburger button
function toggleMenu() {
    const navLinks = document.querySelector('.nav-links');
    const hamburger = document.querySelector('.hamburger');
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('active');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const navLinks = document.querySelector('.nav-links');
    const hamburger = document.querySelector('.hamburger');
    if (navLinks.classList.contains('active') && 
        !e.target.closest('.nav-links') && 
        !e.target.closest('.hamburger')) {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
    }
});

// Gallery Modal Functions
function openModal(element) {
    const modal = document.getElementById("imageModal");
    const modalImg = document.getElementById("modalImage");
    const modalCaption = document.getElementById("modalCaption");
    
    modal.style.display = "block";
    modalImg.src = element.querySelector('img').src;
    modalCaption.innerHTML = element.querySelector('.gallery-caption').innerHTML;
}

function closeModal() {
    document.getElementById("imageModal").style.display = "none";
}

// Close modal when pressing escape key
document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        closeModal();
    }
});
