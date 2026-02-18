// Constants

const JOB_CARD_SELECTOR = '[data-view-name="job-search-job-card"]'

// State

let blockedCompanies = new Set()
let jobsObserver = null

function isJobsPage() {
  return location.pathname.startsWith('/jobs')
}

// Storage

async function blockCompany(companyName) {
  blockedCompanies.add(companyName)

  const companiesArray = Array.from(blockedCompanies)

  return new Promise(resolve => chrome.storage.sync.set({ blockedCompanies: companiesArray }, resolve))
}

async function loadBlockedCompanies() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['blockedCompanies'], result => {
      blockedCompanies = new Set(result.blockedCompanies || [])

      resolve()
    })
  })
}

// DOM Helpers

function createBlockButton(companyName) {
  const button = document.createElement('button')

  button.className = 'linkedin-company-blocker-btn'

  button.setAttribute('type', 'button')
  button.setAttribute('aria-label', `Block ${companyName}`)
  button.setAttribute('title', `Block ${companyName}`)

  button.textContent = '🚫'

  return button
}

function extractCompanyName(card) {
  // Navigate from the logo figure to the company name in the adjacent text area.
  try {
    // Find the company logo.
    const figure = card.querySelector('figure[data-view-name="image"]')

    if (!figure) return null

    // Text content is the figure's next sibling.
    const textArea = figure.nextElementSibling

    if (!textArea) return null

    // Look for a div with both direct <p> and <div> children.
    const findInfoDiv = element => {
      if (!element) return null

      const directChildren = Array.from(element.children)
      const hasDirectP = directChildren.some(child => child.tagName === 'P')
      const hasDirectDiv = directChildren.some(child => child.tagName === 'DIV')

      if (hasDirectP && hasDirectDiv) {
        const divChild = directChildren.find(child => child.tagName === 'DIV')

        if (divChild) {
          const companyP = divChild.querySelector('p')

          if (companyP) return companyP.textContent.trim()
        }
      }

      for (const child of directChildren) {
        const result = findInfoDiv(child)

        if (result) return result
      }

      return null
    }

    return findInfoDiv(textArea)
  } catch (error) {
    console.error('Error extracting company name:', error)

    return null
  }
}

function setCardVisibility(card, visible) {
  const cardWrapper = card.parentElement?.parentElement

  if (!cardWrapper) return false

  cardWrapper.style.display = visible ? '' : 'none'

  const nextElement = cardWrapper.nextElementSibling

  if (nextElement && nextElement.tagName === 'HR') {
    nextElement.style.display = visible ? '' : 'none'
  }

  return !visible
}

function isCardVisible(card) {
  const cardWrapper = card.parentElement?.parentElement

  return cardWrapper && cardWrapper.style.display !== 'none'
}

function clickCard(card) {
  if (!isCardVisible(card)) return false

  const clickableButton = card.querySelector('[role="button"]')

  if (clickableButton) {
    clickableButton.click()

    return true
  }

  return false
}

// Card Visibility

function hideCardsFromCompany(companyName, originatingCard = null) {
  const allCards = document.querySelectorAll(JOB_CARD_SELECTOR)
  const cardArray = Array.from(allCards)

  let hiddenAny = false
  let originatingIndex = -1

  cardArray.forEach((card, index) => {
    const cardCompanyName = extractCompanyName(card)

    if (card === originatingCard) {
      originatingIndex = index
    }

    if (cardCompanyName === companyName) {
      if (setCardVisibility(card, false)) {
        hiddenAny = true
      }
    }
  })

  if (!hiddenAny) return

  if (!originatingCard || originatingIndex === -1) {
    selectFirstVisibleCard()
    return
  }

  // Try next visible card.
  for (let i = originatingIndex + 1; i < cardArray.length; i++) {
    if (clickCard(cardArray[i])) return
  }

  // Fall back to previous visible card.
  for (let i = originatingIndex - 1; i >= 0; i--) {
    if (clickCard(cardArray[i])) return
  }
}

function selectFirstVisibleCard() {
  const allCards = document.querySelectorAll(JOB_CARD_SELECTOR)

  for (const card of allCards) {
    if (clickCard(card)) return
  }
}

// Card Processing

function processJobCard(card, hiddenTracker) {
  if (card.hasAttribute('data-blocker-processed')) return

  const companyName = extractCompanyName(card)

  if (!companyName) return

  card.setAttribute('data-blocker-processed', 'true')

  if (blockedCompanies.has(companyName)) {
    if (setCardVisibility(card, false)) {
      hiddenTracker.hiddenAny = true
    }

    return
  }

  // Inject next to the dismiss button.
  const dismissButton = card.querySelector('button[data-view-name="dismiss-job"]')

  if (!dismissButton) return

  const blockButton = createBlockButton(companyName)

  dismissButton.parentElement.insertBefore(blockButton, dismissButton)

  blockButton.addEventListener('click', async event => {
    event.stopPropagation()
    event.preventDefault()

    await blockCompany(companyName)

    hideCardsFromCompany(companyName, card)
  })
}

function scanJobCards() {
  const cards = document.querySelectorAll(JOB_CARD_SELECTOR)
  const hiddenTracker = { hiddenAny: false }

  cards.forEach(card => {
    processJobCard(card, hiddenTracker)
  })

  if (hiddenTracker.hiddenAny) selectFirstVisibleCard()
}

// Event Listeners

// Sync blocked list when popup changes it.
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.blockedCompanies && isJobsPage()) {
    blockedCompanies = new Set(changes.blockedCompanies.newValue || [])

    let hiddenAny = false

    const allCards = document.querySelectorAll(JOB_CARD_SELECTOR)

    allCards.forEach(card => {
      const companyName = extractCompanyName(card)

      if (companyName) {
        if (blockedCompanies.has(companyName)) {
          if (setCardVisibility(card, false)) {
            hiddenAny = true
          }
        } else {
          setCardVisibility(card, true)
        }
      }
    })

    if (hiddenAny) selectFirstVisibleCard()
  }
})

// Initialization

function teardownJobsPage() {
  if (jobsObserver) {
    jobsObserver.disconnect()
    jobsObserver = null
  }
}

async function initialize() {
  if (!isJobsPage()) return

  teardownJobsPage()

  await loadBlockedCompanies()

  scanJobCards()

  jobsObserver = new MutationObserver(scanJobCards)

  jobsObserver.observe(document.body, { childList: true, subtree: true })
}

function scheduleInitialize() {
  setTimeout(() => initialize(), 0)
}

function setupNavigationListener() {
  if (typeof navigation !== 'undefined' && navigation.addEventListener) {
    navigation.addEventListener('navigate', (event) => {
      const destinationUrl = new URL(event.destination.url)

      if (destinationUrl.pathname.startsWith('/jobs')) {
        scheduleInitialize()
      } else if (isJobsPage()) {
        teardownJobsPage()
      }
    })
    return
  }

  const onUrlChange = () => {
    if (isJobsPage()) {
      scheduleInitialize()
    } else {
      teardownJobsPage()
    }
  }

  window.addEventListener('popstate', onUrlChange)

  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function (...args) {
    originalPushState.apply(this, args)
    onUrlChange()
  }
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    onUrlChange()
  }
}

function onLoad() {
  setupNavigationListener()

  if (isJobsPage()) {
    initialize()
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onLoad)
} else {
  onLoad()
}
