// DOM Elements

const companiesList = document.getElementById('companiesList')
const countElement = document.getElementById('count')
const saveBtn = document.getElementById('saveBtn')
const statusMessage = document.getElementById('statusMessage')

// Functions

function parseCompanyLines(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

function loadCompanies() {
  chrome.storage.sync.get(['blockedCompanies'], result => {
    const companies = result.blockedCompanies || []

    companiesList.value = companies.join('\n')

    updateCount(companies.length)
  })
}

function saveCompanies() {
  const text = companiesList.value

  const companies = parseCompanyLines(text)

  const uniqueCompanies = [...new Set(companies)]

  chrome.storage.sync.set({ blockedCompanies: uniqueCompanies }, () => {
    if (chrome.runtime.lastError) {
      showStatus('Error saving companies', true)

      console.error(chrome.runtime.lastError)
    } else {
      updateCount(uniqueCompanies.length)

      companiesList.value = uniqueCompanies.join('\n')

      showStatus('Saved')
    }
  })
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message
  statusMessage.className = `status-message ${isError ? 'error' : 'success'}`

  setTimeout(() => {
    statusMessage.className = 'status-message'
  }, 3000)
}

function updateCount(count) {
  countElement.textContent = `${count} ${count === 1 ? 'company' : 'companies'} blocked`
}

// Event Listeners

companiesList.addEventListener('input', () => {
  const lines = parseCompanyLines(companiesList.value)

  updateCount(lines.length)
})

companiesList.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()

    return saveCompanies()
  }
})

saveBtn.addEventListener('click', saveCompanies)

// Initialization

loadCompanies()
