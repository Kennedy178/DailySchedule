/**
 * Help Page JavaScript - Professional Implementation
 * Handles FAQ accordions, navigation, lightbox, modal, and contact form
 */

class HelpPageManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupNavigation();
        this.setupLightbox();
        this.setupModal();
        this.setupContactForm();
        this.handleContactLinking();
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Help page loaded successfully');
        });

        // FAQ accordion toggles
        const sectionHeaders = document.querySelectorAll('.section-header');
        sectionHeaders.forEach(header => {
            header.addEventListener('click', (e) => this.toggleAccordion(e));
        });

        // Scroll spy for navigation
        window.addEventListener('scroll', () => this.updateActiveNavigation());
    }

    /**
     * Handle contact form linking from same page and external pages
     */
    handleContactLinking() {
        // Check URL parameters and hash for contact form opening
        const urlParams = new URLSearchParams(window.location.search);
        const shouldOpenContact = urlParams.get('openContact') === 'true' || window.location.hash === '#contact';
        
        if (shouldOpenContact) {
            setTimeout(() => {
                this.openContactForm();
            }, 100);
        }

        // Handle contact developer links on the same page
        const contactLinks = document.querySelectorAll('a[href="#contact"]');
        
        contactLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.openContactForm();
            });
        });
    }

    /**
     * Open contact form section with smooth animations
     */
    openContactForm() {
        const contactSection = document.getElementById('contact');
        const contactContent = document.getElementById('contact-content');
        const contactHeader = contactSection?.querySelector('.section-header');
        
        if (contactSection && contactContent && contactHeader) {
            // Close all other accordions first
            this.closeAllAccordions();
            
            // Open the contact accordion
            contactHeader.classList.add('active');
            contactContent.classList.add('active');
            
            // Smooth scroll to the contact section
            setTimeout(() => {
                contactSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // Focus on the email input after scrolling
                setTimeout(() => {
                    const emailInput = document.getElementById('email');
                    if (emailInput) {
                        emailInput.focus();
                        // Add a subtle highlight effect
                        emailInput.style.boxShadow = '0 0 0 2px rgba(76, 175, 80, 0.3)';
                        setTimeout(() => {
                            emailInput.style.boxShadow = '';
                        }, 2000);
                    }
                }, 800);
            }, 300);
        }
    }

    /**
     * Toggle FAQ accordion sections
     */
    toggleAccordion(event) {
        const header = event.currentTarget;
        const target = header.getAttribute('data-target');
        
        // Handle history modal differently
        if (target === 'history-modal') {
            this.openHistoryModal();
            return;
        }

        const content = document.getElementById(target);
        if (!content) return;

        const isActive = header.classList.contains('active');
        
        // Close all other accordions for better UX
        this.closeAllAccordions();
        
        if (!isActive) {
            // Open this accordion
            header.classList.add('active');
            content.classList.add('active');
            
            // Smooth scroll to section
            setTimeout(() => {
                header.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }, 300);
        }
    }

    /**
     * Close all accordion sections
     */
    closeAllAccordions() {
        const headers = document.querySelectorAll('.section-header');
        const contents = document.querySelectorAll('.section-content');
        
        headers.forEach(header => header.classList.remove('active'));
        contents.forEach(content => content.classList.remove('active'));
    }

    /**
     * Setup floating navigation
     */
    setupNavigation() {
        const navToggle = document.getElementById('navToggle');
        const floatingNav = document.getElementById('floatingNav');
        const navLinks = document.querySelectorAll('.nav-links a');

        if (navToggle && floatingNav) {
            navToggle.addEventListener('click', () => {
                floatingNav.classList.toggle('collapsed');
            });
        }

        // Smooth scroll for navigation links
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    // Close navigation on mobile after clicking
                    if (window.innerWidth <= 768) {
                        floatingNav.classList.add('collapsed');
                    }
                    
                    // Handle contact section specially
                    if (targetId === 'contact') {
                        this.openContactForm();
                        return;
                    }
                    
                    targetElement.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });

                    // Open the target accordion
                    setTimeout(() => {
                        const header = targetElement.querySelector('.section-header');
                        if (header && !header.classList.contains('active')) {
                            header.click();
                        }
                    }, 500);
                }
            });
        });
    }

    /**
     * Update active navigation based on scroll position
     */
    updateActiveNavigation() {
        const sections = document.querySelectorAll('.faq-section');
        const navLinks = document.querySelectorAll('.nav-links a');
        
        let currentSection = '';
        
        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= 100 && rect.bottom >= 100) {
                currentSection = section.id;
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSection}`) {
                link.classList.add('active');
            }
        });
    }

    /**
     * Setup screenshot lightbox functionality
     */
    setupLightbox() {
        const screenshots = document.querySelectorAll('.screenshot');
        const lightbox = document.getElementById('lightbox');
        const lightboxImage = document.getElementById('lightboxImage');
        const lightboxClose = document.getElementById('lightboxClose');

        screenshots.forEach(screenshot => {
            screenshot.addEventListener('click', () => {
                const imageSrc = screenshot.src;
                const imageAlt = screenshot.alt;
                
                // Debug: Check if image source exists
                console.log('Opening lightbox for:', imageSrc);
                
                lightboxImage.src = imageSrc;
                lightboxImage.alt = imageAlt;
                lightbox.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        });

        // Close lightbox
        const closeLightbox = () => {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        };

        if (lightboxClose) {
            lightboxClose.addEventListener('click', closeLightbox);
        }

        // Close on background click
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });
    }

   /**
 * Load story content from external HTML file
 */
async loadStoryContent() {
    try {
        const response = await fetch('story-content.html');
        if (response.ok) {
            const htmlContent = await response.text();
            return htmlContent;
        } else {
            throw new Error('Failed to load story content');
        }
    } catch (error) {
        console.error('Error loading story content:', error);
        return '<div style="color: #FF6B6B; text-align: center; padding: 2rem;"><p>Sorry, the story content could not be loaded at this time.</p><p>Please try again later.</p></div>';
    }
}

/**
 * Open history modal and load story content
 */
async openHistoryModal() {
    const historyModal = document.getElementById('historyModal');
    const modalBody = historyModal?.querySelector('.history-modal-body');
    
    if (historyModal) {
        historyModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Show loading state
        if (modalBody) {
            modalBody.innerHTML = '<div style="text-align: center; padding: 3rem; color: #A0A0A0;"><p>Loading the GetItDone story...</p></div>';
            
            // Load the story content
            const storyContent = await this.loadStoryContent();
            modalBody.innerHTML = storyContent;
        }
    }
}

/**
 * Setup history modal functionality
 */
setupModal() {
    const historyModal = document.getElementById('historyModal');
    const modalClose = document.getElementById('modalClose');
    const modalTrigger = document.querySelector('.history-modal-trigger');

    // Add click event to modal trigger
    if (modalTrigger) {
        modalTrigger.addEventListener('click', () => {
            this.openHistoryModal();
        });
    }

    // Close modal
    const closeModal = () => {
        if (historyModal) {
            historyModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    // Close on background click
    if (historyModal) {
        historyModal.addEventListener('click', (e) => {
            if (e.target === historyModal) {
                closeModal();
            }
        });
    }

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && historyModal && historyModal.classList.contains('active')) {
            closeModal();
        }
    });
}
    /**
     * Setup contact form functionality
     */
    setupContactForm() {
        const contactForm = document.getElementById('contactForm');
        if (!contactForm) return;

        const formFeedback = document.getElementById('formFeedback');
        const submitBtn = contactForm.querySelector('.submit-btn');
        const btnText = submitBtn?.querySelector('.btn-text');
        const btnSpinner = submitBtn?.querySelector('.btn-spinner');

        // Handle custom subject when "Other" is selected
        const subjectSelect = document.getElementById('subject');
        const customSubjectGroup = document.getElementById('customSubjectGroup');
        const customSubjectInput = document.getElementById('customSubject');

        if (subjectSelect && customSubjectGroup && customSubjectInput) {
            subjectSelect.addEventListener('change', function() {
                if (this.value === 'Other') {
                    customSubjectGroup.style.display = 'block';
                    customSubjectInput.required = true;
                    customSubjectInput.focus();
                } else {
                    customSubjectGroup.style.display = 'none';
                    customSubjectInput.required = false;
                    customSubjectInput.value = '';
                }
            });
        }

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Validate form
            if (!this.validateForm(contactForm)) {
                return;
            }

            // Check honeypot
            const honeypot = contactForm.querySelector('input[name="website"]');
            if (honeypot && honeypot.value.trim() !== '') {
                // Bot detected - silently fail
                console.log('Bot detected via honeypot');
                return;
            }

            // Show loading state
            if (submitBtn && btnText && btnSpinner) {
                this.setLoadingState(submitBtn, btnText, btnSpinner, true);
            }
            
            // Prepare form data
            const formData = new FormData(contactForm);
            const data = {
                email: formData.get('email'),
                subject: formData.get('subject') === 'Other' ? formData.get('customSubject') : formData.get('subject'),
                message: formData.get('message'),
                website: formData.get('website') || '' // Include honeypot
            };

            try {
                // Send to FastAPI backend
                const response = await fetch('http://localhost:8000/contact/', {  
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                // Check if response is ok
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Server response error:', response.status, errorData);
                    
                    // Handle validation errors (422)
                    if (response.status === 422 && errorData.detail) {
                        const validationErrors = errorData.detail.map(err => err.msg.replace('Value error, ', '')).join(', ');
                        throw new Error(validationErrors);
                    }
                    
                    throw new Error(`Server error: ${response.status}`);
                }

                const result = await response.json();

                if (result.success) {
                    // Success
                    this.showFeedback(
                        formFeedback, 
                        `Thanks, your message has been sent. We'll reply to <strong>${data.email}</strong> as soon as possible.`,
                        'success'
                    );
                    contactForm.reset();
                } else {
                    // Server error
                    throw new Error(result.message || 'Server error');
                }

            } catch (error) {
                console.error('Contact form error:', error);
                this.showFeedback(
                    formFeedback,
                    error.message || 'Something went wrong, please try again.',
                    'error'
                );
            } finally {
                // Hide loading state
                if (submitBtn && btnText && btnSpinner) {
                    this.setLoadingState(submitBtn, btnText, btnSpinner, false);
                }
            }
        });
    }

    /**
     * Validate contact form
     */
    validateForm(form) {
        const email = form.querySelector('#email');
        const subject = form.querySelector('#subject');
        const message = form.querySelector('#message');
        const customSubject = form.querySelector('#customSubject');
        
        let isValid = true;
        
        // Reset previous validation styles
        [email, subject, message, customSubject].forEach(field => {
            if (field) field.style.borderColor = '';
        });

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !email.value.trim()) {
            this.highlightError(email);
            isValid = false;
        } else if (!emailRegex.test(email.value.trim())) {
            this.highlightError(email);
            isValid = false;
        }

        // Subject validation
        if (!subject || !subject.value.trim()) {
            this.highlightError(subject);
            isValid = false;
        } else if (subject.value === 'Other' && (!customSubject || !customSubject.value.trim())) {
            // If "Other" is selected, custom subject must be filled
            this.highlightError(customSubject);
            isValid = false;
        }

        // Message validation
        if (!message || !message.value.trim()) {
            this.highlightError(message);
            isValid = false;
        }

        if (!isValid) {
            this.showFeedback(
                document.getElementById('formFeedback'),
                'Please fill in all required fields correctly.',
                'error'
            );
        }

        return isValid;
    }

    /**
     * Highlight form field error
     */
    highlightError(field) {
        if (!field) return;
        
        field.style.borderColor = '#EF5350';
        field.addEventListener('input', () => {
            field.style.borderColor = '';
        }, { once: true });
    }

    /**
     * Set loading state for submit button
     */
    setLoadingState(button, textElement, spinnerElement, isLoading) {
        if (!button || !textElement || !spinnerElement) return;
        
        if (isLoading) {
            button.disabled = true;
            textElement.style.display = 'none';
            spinnerElement.style.display = 'block';
        } else {
            button.disabled = false;
            textElement.style.display = 'block';
            spinnerElement.style.display = 'none';
        }
    }

    /**
     * Show feedback message
     */
    showFeedback(element, message, type) {
        if (!element) return;
        
        element.innerHTML = message;
        element.className = `form-feedback ${type}`;
        element.style.display = 'block';
        
        // Auto-hide after 8 seconds for success, 5 seconds for error
        const hideDelay = type === 'success' ? 8000 : 5000;
        setTimeout(() => {
            element.style.display = 'none';
        }, hideDelay);

        // Smooth scroll to feedback
        setTimeout(() => {
            element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }, 100);
    }
}

// Initialize the help page manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new HelpPageManager();
});

// Handle page navigation from external links
window.addEventListener('load', () => {
    const hash = window.location.hash;
    if (hash) {
        const targetElement = document.querySelector(hash);
        if (targetElement) {
            setTimeout(() => {
                // Handle contact section specially
                if (hash === '#contact') {
                    // This will be handled by handleContactLinking method
                    return;
                }
                
                targetElement.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // Auto-open accordion
                const header = targetElement.querySelector('.section-header');
                if (header) {
                    setTimeout(() => header.click(), 500);
                }
            }, 100);
        }
    }
});