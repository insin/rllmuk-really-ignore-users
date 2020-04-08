// ==UserScript==
// @name        Rllmuk Really Ignore Users
// @description Really ignore ignored users, and ignore users in specific topics
// @namespace   https://github.com/insin/greasemonkey/
// @version     6
// @match       https://www.rllmukforum.com/index.php*
// ==/UserScript==
function addStyle(css) {
  let $style = document.createElement('style')
  $style.appendChild(document.createTextNode(css))
  document.querySelector('head').appendChild($style)
}

function TopicPage() {
  let topicId = document.body.dataset.pageid
  let ignoredUserIds = JSON.parse(localStorage.ignoredUserIds || '[]')
  let ignoredUsersInTopics = JSON.parse(localStorage.ignoredUsersInTopics || '{}')
  let topicIgnoredUserIds = []
  if (ignoredUsersInTopics[topicId]) {
    topicIgnoredUserIds = ignoredUsersInTopics[topicId].users.map(user => user.id)
    ignoredUserIds.push(...topicIgnoredUserIds)
  }

  // Hide "You've chosen to ignore content by <ignored user>"
  addStyle(`
    .ipsComment_ignored {
      display: none;
    }
  `)

  // Hide posts containing elements which have an ignored user id as a specified
  // data attribute.
  function hidePostsByDataAttribute(elements, dataAttribute) {
    elements.forEach(el => {
      if (!ignoredUserIds.includes(el.dataset[dataAttribute])) return
      let post = el.closest('article.ipsComment')
      if (post.style.display == 'none') return
      post.style.display = 'none'
    })
  }

  // Hide posts which quote ignored users
  function processQuotes(context) {
    hidePostsByDataAttribute(
      context.querySelectorAll('[data-ipsquote-userid]'),
      'ipsquoteUserid'
    )
  }

  // Hide posts which @-mention ignored users
  function processMentions(context) {
    hidePostsByDataAttribute(
      context.querySelectorAll('[data-mentionid]'),
      'mentionid'
    )
  }

  // Hide posts by users ignored in this specific topic
  function processTopicIgnoredPosts(context = document) {
    if (topicIgnoredUserIds.length == 0) return

    let postAvatarLinks = context.querySelectorAll('li.cAuthorPane_photo a')
    postAvatarLinks.forEach(el => {
      let userId = /profile\/(\d+)/.exec(el.href)[1]
      if (!topicIgnoredUserIds.includes(userId)) return
      let post = el.closest('article.ipsComment')
      if (post.style.display == 'none') return
      post.style.display = 'none'
    })
  }

  // Hide the unread comment separator if all subsequent posts are hidden
  function updateUnreadCommentSeparator() {
    let separator = document.querySelector('hr.ipsCommentUnreadSeperator')
    if (!separator) return
    let hasVisiblePost = false
    let sibling = separator.nextElementSibling
    while (sibling) {
      if (sibling.matches('article.ipsComment') &&
          !sibling.classList.contains('ipsHide') &&
          sibling.style.display != 'none') {
        hasVisiblePost = true
        break
      }
      sibling = sibling.nextElementSibling
    }
    separator.style.display = hasVisiblePost ? '' : 'none'
  }

  // Process all posts on the current page
  function processPosts(context = document) {
    processQuotes(context)
    processMentions(context)
    processTopicIgnoredPosts(context)
  }

  // Process initial posts
  processPosts()
  updateUnreadCommentSeparator()

  // Add a new control to a user's hover card to ignore them in this topic
  function processHoverCard($el) {
    if (!$el.classList.contains('ipsHovercard')) return

    // Create a new "Topic Ignore" control
    let $topicIgnoreItem = document.createElement('li')
    $topicIgnoreItem.innerHTML = `<a href="#">
      <i class="fa fa-times-circle"></i> Topic Ignore
    </a>`
    let $ignoreLink = $topicIgnoreItem.querySelector('a')
    $ignoreLink.addEventListener('click', (e) => {
      e.preventDefault()

      let topicName = document.querySelector('.ipsType_pageTitle').innerText
      let user = {
        id: /profile\/(\d+)/.exec($el.querySelector('a').href)[1],
        name: $el.querySelector('h2').innerText,
        avatar: $el.querySelector('img.ipsUserPhoto').src,
      }

      // Add the user to the ignored users config for this topic
      let ignoredUsersInTopics = JSON.parse(localStorage.ignoredUsersInTopics || '{}')
      if (ignoredUsersInTopics[topicId] == undefined) {
        ignoredUsersInTopics[topicId] = {
          name: topicName,
          users: [],
        }
      }
      ignoredUsersInTopics[topicId].name = topicName
      ignoredUsersInTopics[topicId].users.push(user)
      localStorage.ignoredUsersInTopics = JSON.stringify(ignoredUsersInTopics)

      // Apply the new ignored user settings
      ignoredUserIds.push(user.id)
      topicIgnoredUserIds.push(user.id)
      processPosts()
      updateUnreadCommentSeparator()

      // Hide the hover card
      $el.style.display = 'none'
    })

    // Insert the new control into the hover card
    let $findContentItem = $el.querySelector('ul.ipsList_inline li:last-child')
    $findContentItem.parentNode.insertBefore($topicIgnoreItem, $findContentItem)
  }

  // Watch for posts being replaced when paging
  new MutationObserver(mutations =>
    mutations.forEach(mutation => {
      if (mutation.oldValue == 'true') {
        processPosts()
        updateUnreadCommentSeparator()
      }
    })
  ).observe(document.querySelector('div.cTopic'), {
    attributes: true,
    attributeFilter: ['animating'],
    attributeOldValue: true,
  })

  // Watch for new posts being loaded into the current page
  new MutationObserver(mutations => {
    mutations.forEach(mutation =>
      mutation.addedNodes.forEach(processPosts)
    )
    updateUnreadCommentSeparator()
  }).observe(document.querySelector('#elPostFeed > form'), {
    childList: true,
  })

  // Watch for user hover cards being added for display
  new MutationObserver(mutations => {
    mutations.forEach(mutation =>
      mutation.addedNodes.forEach(processHoverCard)
    )
  }).observe(document.body, {
    childList: true,
  })
}

function IgnoredUsersPage() {
  // Sync ignored user ids
  localStorage.ignoredUserIds = JSON.stringify(
    Array.from(document.querySelectorAll('[data-ignoreuserid]')).map(el =>
      el.dataset.ignoreuserid
    )
  )

  // Add a new section to manage users ignored in specific topics
  let $mainArea = document.querySelector('#ipsLayout_mainArea')
  $mainArea.appendChild(document.createElement('br'))
  let $div = document.createElement('div')
  $div.className = 'ipsBox'

  function populateIgnoredUsersInTopics() {
    let ignoredUsersInTopics = JSON.parse(localStorage.ignoredUsersInTopics || '{}')

    $div.innerHTML = `
      <h2 class="ipsType_sectionTitle ipsType_reset ipsClear">Users currently being ignored in specific topics</h2>
      <ol class="ipsDataList ipsGrid ipsGrid_collapsePhone ipsClear" data-role="tableRows">
      </ol>`
    let $ol = $div.querySelector('ol')

    if (Object.keys(ignoredUsersInTopics).length == 0) {
      $ol.innerHTML = `<li class="ipsDataItem">
        <div class="ipsType_light ipsType_center ipsPad">
          <br>
          <br>
          You're not currently ignoring any users in specific topics.
        </div>
      </li>`
    }

    for (let [topicId, topicConfig] of Object.entries(ignoredUsersInTopics)) {
      for (let user of topicConfig.users) {
        let $li = document.createElement('li')
        $li.className = 'ipsDataItem ipsGrid_span6 ipsFaded_withHover'
        $li.innerHTML = `
          <p class="ipsType_reset ipsDataItem_icon">
            <a href="https://www.rllmukforum.com/index.php?/profile/${user.id}" class="ipsUserPhoto ipsUserPhoto_tiny">
              <img src="${user.avatar}" alt="${user.name}">
            </a>
          </p>
          <div class="ipsDataItem_main">
            <h4 class="ipsDataItem_title"><strong>${user.name}</strong></h4>
            <ul class="ipsList_inline">
              <li class="ipsType_light">
                in <a href="https://www.rllmukforum.com/index.php?/topic/${topicId}">
                  ${topicConfig.name}
                </a>
              </li>
              <li>
                <a href="#" class="unignore ipsPos_middle ipsType_blendLinks">
                  <i class="fa fa-times-circle"></i> Stop ignoring
                </a>
              </li>
            </ul>
          </div>`
        $li.querySelector('a.unignore').addEventListener('click', (e) => {
          e.preventDefault()
          let ignoredUsersInTopics = JSON.parse(localStorage.ignoredUsersInTopics || '{}')
          if (!ignoredUsersInTopics[topicId]) return populateIgnoredUsersInTopics()
          let index = ignoredUsersInTopics[topicId].users.findIndex(u => u.id == user.id)
          if (index == -1) return populateIgnoredUsersInTopics()
          ignoredUsersInTopics[topicId].users.splice(index, 1)
          if (ignoredUsersInTopics[topicId].users.length == 0) {
            delete ignoredUsersInTopics[topicId]
          }
          localStorage.ignoredUsersInTopics = JSON.stringify(ignoredUsersInTopics)
          populateIgnoredUsersInTopics()
        })
        $ol.appendChild($li)
      }
    }

    $mainArea.appendChild($div)
  }

   populateIgnoredUsersInTopics()
}

let page
if (location.href.includes('index.php?/topic/')) {
  page = TopicPage
} else if (location.href.includes('index.php?/ignore/')) {
  page = IgnoredUsersPage
}

if (page) {
  page()
}
