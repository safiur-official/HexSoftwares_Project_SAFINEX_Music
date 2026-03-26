/* 
AUDIO PLAYER OBJECT
 */
const audio = new Audio()

/* 
AUDIO TAG MAPPING FOR MOOD FILTER
 */
const moodTags = {
relax: "ambient,chill",
focus: "piano,instrumental",
party: "dance,edm",
coding: "lofi,chillhop,beats",
sleep: "meditation,calm"
}

const DEFAULT_COVER = "assets/default-cover.png"
/* 
GLOBAL VARIABLES
 */


let songs = []
let currentSong = 0
let queue = []

let currentPageName = "home"

let isLocalSelectMode = false
let selectedLocalSongs = new Set()

let likedSongs = []

let isShuffle = false
let repeatMode = 0

let listenData = []
let trendingData = []
let favoriteData = []

let listenPage = 0
let trendingPage = 0
let favoritePage = 0
let chipCache = {}
let exploreLoading = false
let exploreScrollInitialized = false
let lastPlaybackMode = null   // "local" | "online"
let playbackMode = "online" 
let isLocalSession = false

let currentSearchType = "songs"
let currentSearchValue = ""


function getLocalSongs(){
   return songs.filter(
      s => s.isLocal && (s.ownerId || GUEST_STORAGE_PREFIX) === getStorageOwnerId()
   )
}
function getOnlineSongs(){
   return songs.filter(s => !s.isLocal)
}

function getCurrentSong(){
   return songs[currentSong] || null
}

function shouldStayInLocalOnly(){
   return currentPageName === "local"
}

function updatePlaybackBadge(mode, force = false){
   const badge = document.getElementById("playbackBadge")
   const text = document.getElementById("badgeText")

   if(!badge || !text) return

   //  prevent useless refresh/flicker
   if(!force && lastPlaybackMode === mode){
      return
   }

   badge.classList.remove("hidden", "local", "online", "pulse")

   if(mode === "local"){
      badge.classList.add("local")
      text.textContent = "📂 🎵"
   }else{
      badge.classList.add("online")
      text.textContent = "🌐 🎵"
   }

   // animate ONLY when mode actually changes
   void badge.offsetWidth
   badge.classList.add("pulse")

   playbackMode = mode
   lastPlaybackMode = mode
}





/* 
SMART RECOMMENDATION ENGINE
 */
let userProfile = {
   moods: {},
   artists: {},
   songs: {},
   recent: [],
   lastUpdated: Date.now()
}

let chipPreload = {}



function generatePremiumCover(title){
const canvas = document.createElement("canvas")
canvas.width = 300
canvas.height = 300
const ctx = canvas.getContext("2d")

const gradients = [
["#ff0033","#33001b"],
["#1db954","#191414"],
["#3a7bd5","#00d2ff"],
["#8e2de2","#4a00e0"]
]

const g = gradients[Math.floor(Math.random()*gradients.length)]
const gradient = ctx.createLinearGradient(0,0,300,300)
gradient.addColorStop(0, g[0])
gradient.addColorStop(1, g[1])

ctx.fillStyle = gradient
ctx.fillRect(0,0,300,300)

ctx.fillStyle = "#fff"
ctx.font = "bold 80px Arial"
ctx.textAlign = "center"
ctx.textBaseline = "middle"

const letter = title.charAt(0).toUpperCase()
ctx.fillText(letter,150,150)

return canvas.toDataURL("image/png")
}

/* 
APP ROUTER
 */


async function navigate(page){
  currentPageName = page

  if(page !== "explore"){
    exploreScrollInitialized = false
  }

  if(page !== "local"){
    isLocalSession = false
  }

  const routes = {
    home: renderHome,
    explore: renderExplore,
    library: renderLibrary,
    liked: renderLiked,
    history: renderHistory,
    local: renderLocal,
    about: renderAbout,
    search: renderSearchPage,
    account: renderAccountPage
  }

  history.pushState({}, "", "/#/" + page)

  if(routes[page]){
    await routes[page]()
  }else{
    await renderHome()
  }

  updateSidebarActive(page)
}

async function navigateWithoutPush(page){
  currentPageName = page

  const routes = {
    home: renderHome,
    explore: renderExplore,
    library: renderLibrary,
    liked: renderLiked,
    history: renderHistory,
    local: renderLocal,
    about: renderAbout,
    search: renderSearchPage,
    account: renderAccountPage
  }

  if(routes[page]){
    await routes[page]()
  }else{
    await renderHome()
  }

  updateSidebarActive(page)
}

function updateSidebarActive(page){

const menuItems = document.querySelectorAll(".sidebar-menu li")

menuItems.forEach(item => {
item.classList.remove("active")

const route = item.id.replace("nav","").toLowerCase()

if(route === page){
item.classList.add("active")
}
})

}


/* 
BROWSER BACK BUTTON SUPPORT
 */

window.addEventListener("popstate", loadRouteFromURL)


/* 
ROUTE RENDER FUNCTIONS
 */



async function renderHome(){
   isLocalSession = false

pageContent.innerHTML = homeHTML

/* RE-BIND DOM AFTER RENDER */
listenRow = document.getElementById("listenRow")
trendingRow = document.getElementById("trendingRow")
favoriteRow = document.getElementById("favoriteRow")

loadHeroSong()
initHomeInteractions()

if(songs.length === 0){
await loadSongsFromAPI()
}

await loadHomeSections()

preloadChips()
}



async function renderExplore(){
   isLocalSession = false

pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Explore</h2>
<div class="song-grid" id="exploreGrid"></div>
`

const grid = document.getElementById("exploreGrid")
const scrollContainer = document.querySelector(".main-content")

let loading = false

/* 
 INITIAL LOAD WITH SKELETON
 */
if(songs.length === 0){

   for(let i=0;i<12;i++){
      const sk = document.createElement("div")
      sk.className = "song-card skeleton"
      sk.innerHTML = `
      <div class="skeleton-img"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-artist"></div>
      `
      grid.appendChild(sk)
   }

   const newSongs = await loadSongsFromAPI()

   grid.innerHTML = ""
   const fragment = document.createDocumentFragment()

   newSongs.forEach(song=>{
      const index = songs.findIndex(s => s.id === song.id)
      fragment.appendChild(createSongCard(song,index))
   })

   grid.appendChild(fragment)

}else{

   const fragment = document.createDocumentFragment()
   songs.forEach((song,index)=>{
      fragment.appendChild(createSongCard(song,index))
   })
   grid.appendChild(fragment)
}

/* 
 INFINITE SCROLL 
 */
if(!exploreScrollInitialized){

   let timeout = null

   const handler = () => {

      if(timeout) return

      timeout = setTimeout(async () => {

         const scrollPosition =
            scrollContainer.scrollTop + scrollContainer.clientHeight

         const threshold =
            scrollContainer.scrollHeight - 300

         if(scrollPosition >= threshold && !loading){

            loading = true

            /*  SHOW SKELETON */
            for(let i=0;i<6;i++){
               const sk = document.createElement("div")
               sk.className = "song-card skeleton"
               sk.innerHTML = `
               <div class="skeleton-img"></div>
               <div class="skeleton-title"></div>
               <div class="skeleton-artist"></div>
               `
               grid.appendChild(sk)
            }

            const newSongs = await loadSongsFromAPI()

            /*  REMOVE SKELETON */
            const skeletons = grid.querySelectorAll(".song-card.skeleton")
            skeletons.forEach(el=>el.remove())

            const fragment = document.createDocumentFragment()

            newSongs.forEach(song=>{
               const index = songs.findIndex(s => s.id === song.id)
               fragment.appendChild(createSongCard(song,index))
            })

            grid.appendChild(fragment)

            loading = false
         }

         timeout = null

      }, 150)
   }

   scrollContainer.addEventListener("scroll", handler)
   exploreScrollInitialized = true
}
}


async function renderLibrary(){
if(songs.length === 0){
await loadSongsFromAPI()
}

pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Your Library</h2>
<div class="song-grid" id="libraryGrid"></div>
`

const grid = document.getElementById("libraryGrid")

/* get liked songs */

if(likedSongs.length === 0){

grid.innerHTML = `
<p style="color:#aaa;font-size:14px">
No songs in your library yet
</p>
`

return

}

/* render saved songs */

likedSongs.forEach(id => {

const index = songs.findIndex(song => song.id === id)

if(index !== -1){

grid.appendChild(createSongCard(songs[index], index))

}

})

}


async function renderLiked(){
if(songs.length === 0){
await loadSongsFromAPI()
}
pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Liked Songs</h2>
<div class="song-grid" id="likedGrid"></div>
`

refreshLikedPage()

}




async function renderHistory(){
if(songs.length === 0){
await loadSongsFromAPI()
}


pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Listening History</h2>
<div class="song-grid" id="historyGrid"></div>
`

const grid = document.getElementById("historyGrid")

const history = getUserStorage("history", []) || []

history.forEach(id=>{
const index = songs.findIndex(s=>s.id===id)
if(index !== -1){
grid.appendChild(createSongCard(songs[index], index))
}
})

}





/* 
UI ELEMENTS
 */
const pageContent = document.getElementById("pageContent")
const likeBtn = document.getElementById("likeSongBtn")

const homeHTML = pageContent.innerHTML

let listenRow = document.getElementById("listenRow")
let trendingRow = document.getElementById("trendingRow")
let favoriteRow = document.getElementById("favoriteRow")

const songName = document.querySelector(".song-name")
const artistName = document.querySelector(".artist-name")
const playerCover = document.getElementById("playerCover")
const bgBlur = document.getElementById("bg-blur")

const progress = document.getElementById("progress")
const volume = document.getElementById("volume")

const volumeBtn = document.getElementById("volumeBtn")
const volumeIcon = document.getElementById("volumeIcon")

let lastVolume = volume.value || 1   // 🔥 store previous volume

volumeBtn.onclick = () => {

if(audio.volume > 0){

/* 🔇 MUTE */
lastVolume = audio.volume
audio.volume = 0
volume.value = 0

volumeIcon.className = "fa-solid fa-volume-xmark"

showToast("Muted 🔇")

}else{

/* 🔊 UNMUTE */
audio.volume = lastVolume || 1
volume.value = audio.volume

volumeIcon.className = "fa-solid fa-volume-high"

showToast("Unmuted 🔊")

}

}

const playBtn = document.getElementById("play")
const nextBtn = document.getElementById("next")
const prevBtn = document.getElementById("prev")


audio.addEventListener("play", ()=>{
   updatePlayingUI()
   playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
})


audio.addEventListener("pause", ()=>{
	updatePlayingUI()
playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
})

const shuffleBtn = document.getElementById("shuffle")

shuffleBtn.onclick = () => {

isShuffle = !isShuffle

if(isShuffle){
shuffleBtn.classList.add("control-active")
shuffleTip.innerText = "Shuffle ON"
showToast("Shuffle ON 🔀")
}else{
shuffleBtn.classList.remove("control-active")
shuffleTip.innerText = "Shuffle OFF"
showToast("Shuffle OFF")
}

}

const repeatBtn = document.getElementById("repeat")
const repeatIcon = document.getElementById("repeatIcon")

repeatBtn.onclick = () => {

repeatMode = (repeatMode + 1) % 3

repeatBtn.classList.remove("control-active")
repeatBtn.removeAttribute("data-repeat")

if(repeatMode === 0){
repeatIcon.className = "fa-solid fa-repeat"
showToast("Repeat OFF")
}

if(repeatMode === 1){
repeatBtn.classList.add("control-active")
repeatIcon.className = "fa-solid fa-repeat"
showToast("Repeat ALL 🔁")
}

if(repeatMode === 2){
repeatBtn.classList.add("control-active")
repeatIcon.className = "fa-solid fa-repeat"
repeatBtn.setAttribute("data-repeat","one")
showToast("Repeat ONE 🔂")
}

}

const currentTimeEl = document.getElementById("current-time")
const durationEl = document.getElementById("duration")

const musicPlayer = document.querySelector(".music-player")



/* 
SIDEBAR ROUTER NAVIGATION
 */

const menuItems = document.querySelectorAll(".sidebar-menu li")

menuItems.forEach(item => {

item.addEventListener("click", () => {

menuItems.forEach(i => i.classList.remove("active"))

item.classList.add("active")

const route = item.id.replace("nav","").toLowerCase()

navigate(route)

})

})




const shuffleTip = document.getElementById("shuffleTip")
const repeatTip = document.getElementById("repeatTip")



/* 
JAMENDO API
 */

const CLIENT_ID = "12748946"

let currentPage = 0
const LIMIT = 50      
const MAX_PAGES = 1000  // limit to prevent infinite loading in case of issues

let isLoading = false
let hasMore = true

/* 
CATEGORY TAG MAP
 */

const categoryMap = {

relax:["ambient","chill","downtempo","relaxing"],

focus:["instrumental","piano","study"],

party:["dance","house","edm"],

coding:["lofi","chillhop","beats"],

sleep:["sleep","meditation","calm"]

}

/* 
DETECT CATEGORY
 */

function detectCategory(tags){

if(!tags) return "other"

for(const category in categoryMap){

const keywords = categoryMap[category]

if(tags.some(tag=>keywords.includes(tag.toLowerCase()))){

return category
}

}

return "other"
}


function smartSortSongs(list){

   return list.sort((a,b)=>{

      const score = (song)=>{
         let s = 0

         s += (userProfile.songs[song.id] || 0) * 5
         s += (userProfile.moods[song.mood] || 0) * 3
         s += (userProfile.artists[song.artist] || 0) * 3

         if(userProfile.recent.includes(song.id)) s += 8

         s += Math.random() * 2

         return s
      }

      return score(b) - score(a)
   })
}


function generateSmartQueue(){

   let pool = []

   const localSongs = getLocalSongs()

   if(localSongs.length > 0){
      // PRIORITY: LOCAL SONGS
      pool = localSongs
   }else{
      //  FALLBACK: ONLINE SONGS
      pool = getOnlineSongs()
   }

   if(pool.length === 0) return

   const sorted = smartSortSongs([...pool])

   queue = sorted
      .slice(0, 25)
      .map(song => songs.findIndex(s => s.id === song.id))

   renderQueue()
}


/* 
LOAD SONGS FROM API
 */

async function loadSongsFromAPI(){

if(isLoading) return []

if(currentPage >= MAX_PAGES){
return []
}

isLoading = true
currentPage++

try{

const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=${LIMIT}&offset=${(currentPage-1)*LIMIT}&audioformat=mp31`

const res = await fetch(url)
const data = await res.json()

const newSongs = data.results.map(track => ({
id:track.id,
title:track.name,
artist:track.artist_name,
cover: getValidCover(track.album_image),
src:track.audio,
mood:detectCategory(Array.isArray(track.tags)?track.tags:[]),
tags:Array.isArray(track.tags)?track.tags:[]
}))

newSongs.forEach(song=>{
if(!songs.some(s => s.id === song.id)){
songs.push(song)
}
})

return newSongs

}catch(err){
console.error("API ERROR:", err)
return []
}finally{
isLoading = false
}
}


async function preloadChips(){

   const moods = Object.keys(moodTags)

   for(const mood of moods){

      if(chipPreload[mood]) continue

      const tags = moodTags[mood].split(",")

      let results = []

      for(const tag of tags){
         const res = await fetch(
            `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=15&tags=${tag.trim()}`
         )

		 
         const data = await res.json()
if(data.results){
   results = [...results, ...data.results]
}      }

     chipPreload[mood] = results.map(track => ({
   id: track.id,
   title: track.name,
   artist: track.artist_name,
   cover: getValidCover(track.album_image),
   src: track.audio,
   mood: mood,
   tags: Array.isArray(track.tags) ? track.tags : []
}))
   }

   console.log(" Chips Preloaded")
}

/* 
section-specific loaders
 */
async function loadHomeSections(){

/*   */
listenRow = document.getElementById("listenRow")
trendingRow = document.getElementById("trendingRow")
favoriteRow = document.getElementById("favoriteRow")

await Promise.all([
loadListenAgain(),
loadTrending(),
loadFavorites()
])

removeSkeletonSmooth()
}

function loadListenAgain(){

const history = getUserStorage("history", []) || []

/* FALLBACK IF EMPTY */
if(history.length === 0){
listenData = songs.slice(0, 12)
}else{
listenData = history
.map(index => songs[index])
.filter(Boolean)
}

renderListenRow()
}

async function loadTrending(){
trendingPage++

showSkeleton("trending")

const url =
`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=20&offset=${(trendingPage-1)*20}&audioformat=mp31&order=popularity_total`

const res = await fetch(url)
const data = await res.json()

const newSongs = data.results.map(track => ({
id: track.id,
title: track.name,
artist: track.artist_name,
cover: getValidCover(track.album_image),
src: track.audio,
mood: detectCategory(Array.isArray(track.tags) ? track.tags : []),
tags: Array.isArray(track.tags) ? track.tags : []
}))

trendingData = [...trendingData, ...newSongs]

removeSkeletonSmooth()
renderTrendingRow()
}

function loadFavorites(){
favoriteData = songs.slice(0, 30)
renderFavoriteRow()
}

/* 
row-specific render functions
 */

function renderListenRow(){
if(!listenRow) return

listenRow.innerHTML = ""

const fragment = document.createDocumentFragment()

listenData.forEach(song => {
const index = songs.findIndex(s => s.id === song.id)
if(index !== -1){
fragment.appendChild(createSongCard(songs[index], index))
}
})

listenRow.appendChild(fragment)
}



function renderTrendingRow(){
if(!trendingRow) return

if(trendingPage === 1){
trendingRow.innerHTML = ""
}

const fragment = document.createDocumentFragment()

trendingData.forEach(song => {

let index = songs.findIndex(s => s.id === song.id)

if(index === -1){
if(!songs.some(s => s.id === song.id)){
songs.push(song)
}
index = songs.findIndex(s => s.id === song.id)
}

fragment.appendChild(createSongCard(songs[index], index))

})

trendingRow.appendChild(fragment)
}



function renderFavoriteRow(){
if(!favoriteRow) return

favoriteRow.innerHTML = ""

const fragment = document.createDocumentFragment()

favoriteData.forEach(song => {
const index = songs.findIndex(s => s.id === song.id)
if(index !== -1){
fragment.appendChild(createSongCard(songs[index], index))
}
})

favoriteRow.appendChild(fragment)
}



/* 
INFINITE SONG LOADER
 */

const mainContent = document.querySelector(".main-content")

let scrollTimeout = null

mainContent.addEventListener("scroll", () => {

if(scrollTimeout) return   //  prevents spam

scrollTimeout = setTimeout(async () => {

const scrollPosition =
mainContent.scrollTop + mainContent.clientHeight

const threshold =
mainContent.scrollHeight - 200

if(scrollPosition >= threshold){

/*  EXTRA SAFETY */
if(!isLoading && hasMore){
await loadSongsFromAPI()
}

}

scrollTimeout = null

}, 200) //  throttle delay (tune: 150–300)

})


/* 
SHOW SKELETON CARDS
 */

function showSkeleton(type){
let container = null

if(type === "listen") container = listenRow
if(type === "trending") container = trendingRow
if(type === "favorite") container = favoriteRow

if(container && container.querySelector(".skeleton")) return

if(!container) return

container.innerHTML = ""

for(let i=0;i<8;i++){
const skeleton = document.createElement("div")
skeleton.className = "song-card skeleton"
skeleton.innerHTML = `
<div class="skeleton-img"></div>
<div class="skeleton-title"></div>
<div class="skeleton-artist"></div>
`
container.appendChild(skeleton)
}

}

function removeSkeletonSmooth(){

const skeletons = document.querySelectorAll(".song-card.skeleton")

skeletons.forEach(el => {
el.classList.add("fade-out")
})

setTimeout(()=>{
skeletons.forEach(el => el.remove())
}, 400)



}

/* 
RENDER SONGS
 */

function renderSongs(list){
if(!listenRow || !trendingRow || !favoriteRow) return

removeSkeletonSmooth()

listenData = list.slice(0, 12)
trendingData = list.slice(12, 36)
favoriteData = list.slice(36, 48)

renderListenRow()
renderTrendingRow()
renderFavoriteRow()
}

function getValidCover(cover){

/*  invalid cases */
if(!cover || cover.trim() === "" || cover.includes("placeholder")){
return DEFAULT_COVER
}

/*  valid */
return cover
}

/* 
CREATE SONG CARD
 */

function createSongCard(song,index){

const card = document.createElement("div")
card.className = "song-card"

/*  ADD THIS */
card.setAttribute("data-index", index)

card.innerHTML = `
<div class="select-checkbox"></div>

<button class="song-menu-btn">
<span class="material-icons">more_vert</span>
</button>

<div class="song-menu">
   <div class="menu-item play-next">
      <span class="material-icons">queue_play_next</span>
      Play next
   </div>
   <div class="menu-item add-queue">
      <span class="material-icons">playlist_add</span>
      Add to queue
   </div>
   <div class="menu-item save-library">
      <span class="material-icons">bookmark_add</span>
      Save to library
   </div>
   <div class="menu-item remove-queue">
      <span class="material-icons">playlist_remove</span>
      Remove from queue
   </div>
   ${
      song.isLocal
      ? `
      <div class="menu-item delete-local">
         <span class="material-icons">delete</span>
         Delete Song
      </div>
      `
      : ""
   }
</div>

<div class="card-image">
   <img src="${getValidCover(song.cover)}">
   <div class="play-overlay">
      <i class="fa-solid fa-play"></i>
   </div>
   <div class="equalizer">
      <span></span>
      <span></span>
      <span></span>
   </div>
</div>

<h4>${song.title}</h4>
<p>${song.artist}</p>
`

if(isLocalSelectMode && song.isLocal && currentPageName === "local"){
   card.classList.add("select-mode")
}

if(selectedLocalSongs.has(song.id)){
   card.classList.add("selected")
}



/* play song */
card.addEventListener("click", (e) => {
   if(e.target.closest(".song-menu") || e.target.closest(".song-menu-btn")){
      return
   }

   const selectedSong = songs[index]
   if(!selectedSong) return

   // 🔥 MULTI-SELECT MODE FOR LOCAL SONGS
   if(isLocalSelectMode && selectedSong.isLocal && currentPageName === "local"){
      if(selectedLocalSongs.has(selectedSong.id)){
         selectedLocalSongs.delete(selectedSong.id)
         card.classList.remove("selected")
      }else{
         selectedLocalSongs.add(selectedSong.id)
         card.classList.add("selected")
      }

      renderLocalActionBar()
      return
   }

   if(currentSong === index){
      if(audio.paused){
         audio.play().catch(()=>{})
      }else{
         audio.pause()
      }
      return
   }

   queue = []

   if(selectedSong.isLocal && currentPageName === "local"){
      queue = getLocalSongs()
         .filter(s => s.id !== selectedSong.id)
         .map(s => songs.findIndex(x => x.id === s.id))
   }

   loadSong(index, true)
})


/* menu toggle */

const menuBtn = card.querySelector(".song-menu-btn")
const menu = card.querySelector(".song-menu")

menuBtn.addEventListener("click", (e)=>{
e.stopPropagation()

document.querySelectorAll(".song-menu.active")
.forEach(m => m.classList.remove("active"))

menu.classList.toggle("active")
})


/* PLAY NEXT */

menu.querySelector(".play-next").onclick = (e)=>{
e.stopPropagation()

const selectedSong = songs[index]
const currentSongObj = songs[currentSong]

if(currentPageName === "local"){
   if(!selectedSong?.isLocal){
      showToast("Only local songs allowed in Local tab")
      return
   }
}else{
   if(currentSongObj?.isLocal && selectedSong?.isLocal){
      // okay
   }else if(currentSongObj?.isLocal && !selectedSong?.isLocal){
      // okay for switching after locals
   }
}

queue.unshift(index)
showToast("Playing next")
renderQueue()
menu.classList.remove("active")
}

/* ADD TO QUEUE */

menu.querySelector(".add-queue").onclick = (e)=>{
e.stopPropagation()

const selectedSong = songs[index]

if(currentPageName === "local" && !selectedSong?.isLocal){
   showToast("Only local songs allowed in Local tab")
   return
}

queue.push(index)
showToast("Added to queue")
renderQueue()
menu.classList.remove("active")
}

/* SAVE TO LIBRARY */

menu.querySelector(".save-library").onclick = (e)=>{
e.stopPropagation()

if(!likedSongs.includes(song.id)){
likedSongs.push(song.id)
setUserStorage("likedSongs", likedSongs)
}

showToast("Saved to library")

menu.classList.remove("active")
}

/* REMOVE FROM QUEUE */

menu.querySelector(".remove-queue").onclick = (e)=>{
e.stopPropagation()

queue = queue.filter(i => i !== index)

showToast("Removed from queue")

renderQueue()

menu.classList.remove("active")
}

const deleteLocalBtn = menu.querySelector(".delete-local")
if(deleteLocalBtn){
   deleteLocalBtn.onclick = (e) => {
      e.stopPropagation()

      const selectedSong = songs[index]
      if(!selectedSong || !selectedSong.isLocal) return

      const deletingCurrent = songs[currentSong]?.id === selectedSong.id

      deleteLocalSongFromDB(selectedSong.id)

      songs = songs.filter(s => s.id !== selectedSong.id)
      queue = []

      if(deletingCurrent){
         audio.pause()
         audio.src = ""
         songName.textContent = "Song Title"
         artistName.textContent = "Artist"
         playerCover.src = ""
         musicPlayer.classList.remove("active")
         updatePlaybackBadge("online", true)
      }

      showToast("Local song deleted")
      refreshLocalGrid()
   }
}

return card

}

/* 
Queue SYSTEM
 */

function renderQueue(){

const list = document.querySelector(".queue-list")

if(!list) return

list.innerHTML=""

queue.forEach(index=>{

const song = songs[index]


const item = document.createElement("div")
item.className = "queue-item"

item.innerHTML = `
<img src="${song.cover}">
<div>
<div class="title">${song.title}</div>
<div class="artist">${song.artist}</div>
</div>
<div class="queue-remove">✕</div>
`

item.querySelector(".queue-remove").onclick = () => {

queue = queue.filter(i => i !== index)

renderQueue()

}

list.appendChild(item)

})
enableQueueDrag()
}

/* 
DRAG SORT QUEUE
 */

function enableQueueDrag(){

const list = document.querySelector(".queue-list")

if(!list) return

let draggedIndex = null

list.querySelectorAll(".queue-item").forEach((item,index)=>{

item.draggable = true

item.addEventListener("dragstart",()=>{
draggedIndex = index
})

item.addEventListener("dragover",(e)=>{
e.preventDefault()
})

item.addEventListener("drop",()=>{

const targetIndex = index

const draggedSong = queue.splice(draggedIndex,1)[0]

queue.splice(targetIndex,0,draggedSong)

renderQueue()

})

})

}

/*
LOAD SONG
 */

function loadSong(index, autoPlay = false){
if(index < 0 || index >= songs.length) return

currentSong = index
const song = songs[index]
if(!song) return

/*  hard source sync */
isLocalSession = !!song.isLocal
playbackMode = song.isLocal ? "local" : "online"

/*  update badge ONLY on song switch */
updatePlaybackBadge(playbackMode)


/*  AI TRACKING START */
userProfile.songs[song.id] = (userProfile.songs[song.id] || 0) + 3

if(song.mood){
   userProfile.moods[song.mood] =
      (userProfile.moods[song.mood] || 0) + 2
}

userProfile.artists[song.artist] =
   (userProfile.artists[song.artist] || 0) + 2

userProfile.recent.unshift(song.id)
userProfile.recent = userProfile.recent.slice(0, 30)

saveUserProfile()
/*  AI TRACKING END */


/*  SMART TRACKING FIX */
userProfile.recent.unshift(song.id)
userProfile.recent = userProfile.recent.slice(0, 20)

if(song.mood){
   userProfile.moods[song.mood] =
      (userProfile.moods[song.mood] || 0) + 1
}

userProfile.artists[song.artist] =
   (userProfile.artists[song.artist] || 0) + 1

audio.pause()
audio.src = song.src
audio.load()

if(autoPlay){
   const safePlay = () => {
      audio.play()
      .then(()=>{
         playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
      })
      .catch(err=>{
         console.warn("Autoplay blocked:", err)
      })
   }

   if(song.isLocal){
      audio.oncanplay = () => {
         audio.oncanplay = null
         safePlay()
      }
   }else{
      safePlay()
   }
}

/* RESUME ONLY LAST PLAYED SONG */
const progressMemory = getUserStorage("songProgress", {}) || {}

const lastPlayedId = getUserStorage("lastPlayedId", null)


if(progressMemory[song.id] > 5 && song.id == lastPlayedId){
audio.currentTime = progressMemory[song.id]
}else{
audio.currentTime = 0
}

/* update like button state */

if(likedSongs.includes(song.id)){
likeBtn.classList.add("active")
}else{
likeBtn.classList.remove("active")
}


songName.innerHTML = `<span>${song.title}</span>`

artistName.textContent = song.artist

const cover = getValidCover(song.cover)

playerCover.src = cover
bgBlur.style.backgroundImage = `url(${cover})`

musicPlayer.classList.add("active")
document.querySelector(".main-content").style.paddingBottom = "110px"


setUserStorage("recentSong", {
   ...song,
   cover: getValidCover(song.cover)
})



setUserStorage("lastPlayedId", song.id)

let history = getUserStorage("history", []) || []

history = history.filter(id => id !== song.id)
history.unshift(song.id)
history = history.slice(0, 50)

setUserStorage("history", history)



/* update queue panel */
renderQueue()
updatePlayingUI()
}





/* 
PLAY PAUSE
*/
playBtn.onclick = () => {

/* ripple animation */

playBtn.classList.add("ripple")

setTimeout(()=>{
playBtn.classList.remove("ripple")
},300)

if(audio.paused){

audio.play().then(()=>{
}).catch(err=>{
console.warn("Play blocked:", err)
})


}else{

audio.pause()


}

}

audio.addEventListener("pause", ()=>{
	updatePlayingUI()
document.querySelectorAll(".song-card").forEach(card=>{
card.classList.remove("playing")

const icon = card.querySelector(".play-overlay i")
if(icon){
icon.className = "fa-solid fa-play"
}
})
})

/* 
NEXT / PREV
 */

nextBtn.onclick=playNext

prevBtn.onclick = ()=>{

if(audio.currentTime > 5){
audio.currentTime = 0
return
}

if(isShuffle){
const currentSongObj = songs[currentSong]
let pool = []

if(currentSongObj?.isLocal){
   pool = getLocalSongs()
}else{
   pool = getOnlineSongs()
}

if(pool.length === 0) return
   const randomSong = pool[Math.floor(Math.random() * pool.length)]
   currentSong = songs.findIndex(s => s.id === randomSong.id)
}else{
   const currentSongObj = songs[currentSong]
   const pool = currentSongObj?.isLocal ? getLocalSongs() : getOnlineSongs()
   if(pool.length === 0) return

   const currentId = currentSongObj?.id
   const indexInPool = pool.findIndex(s => s.id === currentId)

   let prevIndex = indexInPool - 1
   if(prevIndex < 0){
      prevIndex = pool.length - 1
   }

   currentSong = songs.findIndex(s => s.id === pool[prevIndex].id)
}

loadSong(currentSong, true)


}

/* 
NEXT SONG LOGIC
 */

function playNext(){

/* 🔥 QUEUE FIRST */
if(queue.length > 0){
currentSong = queue.shift()
loadSong(currentSong, true)
return
}

/* 🔁 REPEAT ONE */
if(repeatMode === 2){
loadSong(currentSong, true)
return
}

/* 🔀 SHUFFLE */
if(isShuffle){
   
const localSongs = getLocalSongs()
const pool = localSongs.length > 0 ? localSongs : getOnlineSongs()

if(pool.length === 0) return

const randomSong = pool[Math.floor(Math.random() * pool.length)]
currentSong = songs.findIndex(s => s.id === randomSong.id)

loadSong(currentSong, true)
return
}


let pool = []
const currentSongObj = songs[currentSong]
const localSongs = getLocalSongs()
const onlineSongs = getOnlineSongs()

/*  PAGE-AWARE PLAYBACK LOGIC */
if(currentSongObj?.isLocal){
   if(shouldStayInLocalOnly()){
      // Local tab → stay only in local loop
      pool = localSongs
   }else{
      // Other tabs → local finishes, then switch to online
      const currentId = currentSongObj.id
      const localIndex = localSongs.findIndex(s => s.id === currentId)

      if(localIndex !== -1 && localIndex < localSongs.length - 1){
         // still local songs remaining
         pool = localSongs
      }else{
         // local playlist completed → move to online
         pool = onlineSongs
      }
   }
}else{
   // online song continues in online pool
   pool = onlineSongs
}

if(pool.length === 0){
   pool = songs
}



const currentId = songs[currentSong]?.id
const currentIndexInPool = pool.findIndex(s => s.id === currentId)

/* SAFETY FIX */
if(currentIndexInPool === -1){
   currentSong = songs.findIndex(s => s.id === pool[0].id)
   loadSong(currentSong)
   audio.play()
   generateSmartQueue()
   return
}

let nextIndex = currentIndexInPool + 1

if(nextIndex >= pool.length){
   if(shouldStayInLocalOnly() && currentSongObj?.isLocal){
      // Local page always loops local songs
      nextIndex = 0
   }else if(repeatMode === 1){
      nextIndex = 0
   }else{
      return
   }
}



currentSong = songs.findIndex(s => s.id === pool[nextIndex].id)


loadSong(currentSong, true)

}

/* 
PROGRESS BAR
 */

audio.addEventListener("timeupdate",()=>{

if(!audio.duration) return

const percent = (audio.currentTime/audio.duration)*100

progress.value = percent

progress.style.background =
`linear-gradient(to right,#ff0033 ${percent}%,#444 ${percent}%)`

currentTimeEl.textContent = formatTime(audio.currentTime)

/* SAVE PROGRESS MEMORY */

const currentSongObj = songs[currentSong]

if(currentSongObj){

let progressMemory = getUserStorage("songProgress", {}) || {}

progressMemory[currentSongObj.id] = audio.currentTime

setUserStorage("songProgress", progressMemory)


}

})

/* 
SEEK
 */

progress.addEventListener("input",()=>{

audio.currentTime=(progress.value/100)*audio.duration

})

/* 
VOLUME
 */

volume.oninput = () => {

audio.volume = volume.value

if(audio.volume == 0){
volumeIcon.className = "fa-solid fa-volume-xmark"
}else if(audio.volume < 0.5){
volumeIcon.className = "fa-solid fa-volume-low"
}else{
volumeIcon.className = "fa-solid fa-volume-high"
}

}

/* 
DURATION
 */

audio.addEventListener("loadedmetadata",()=>{

durationEl.textContent=formatTime(audio.duration)

})

/* 
SONG ENDED
 */

audio.addEventListener("ended",()=>{

   const song = songs[currentSong]

   /*  CLEAN MEMORY */
   let progressMemory = getUserStorage("songProgress", {}) || {}

   delete progressMemory[song.id]

   localStorage.setItem(
   "songProgress",
   JSON.stringify(progressMemory)
   )

   /*  NEXT SONG (BADGE AUTO SYNC VIA loadSong) */
   playNext()
})

/* 
FORMAT TIME
 */

function formatTime(seconds){

if(isNaN(seconds)) return "0:00"

const mins=Math.floor(seconds/60)

const secs=Math.floor(seconds%60)

return mins+":"+(secs<10?"0"+secs:secs)

}

/* 
SEARCH
 */


const searchInput = document.getElementById("searchInput")

/*
DYNAMIC SEARCH PLACEHOLDER
 */
const placeholderTexts = [
"Search songs...",
"Search artists...",
"Search albums..."
]

let placeholderIndex = 0
let placeholderInterval

function startPlaceholderLoop(){

placeholderInterval = setInterval(() => {

/*  STOP if user typing */
if(searchInput.value.length > 0) return

placeholderIndex = (placeholderIndex + 1) % placeholderTexts.length

searchInput.style.opacity = 0

setTimeout(() => {
searchInput.placeholder = placeholderTexts[placeholderIndex]
searchInput.style.opacity = 1
}, 200)

}, 2000)

}

/* START LOOP */
startPlaceholderLoop()

searchInput.addEventListener("input",()=>{
if(!searchResults) return

const query=searchInput.value.trim()

if(query.length<2){
searchResults.classList.remove("active")
return
}

performSearch(query)

})

searchInput.addEventListener("keydown", (e)=>{
  if(e.key === "Enter"){
    const query = searchInput.value.trim()
    if(query.length >= 2){
      navigateToSearchPage("songs", query)
    }
  }
})

searchInput.addEventListener("focus", ()=>{
  renderRecentSearches()
  renderTrending()

  if(searchInput.value.trim().length >= 2){
    searchResults.classList.add("active")
  }else{
    searchResults.classList.add("active")
  }
})


const searchResults=document.getElementById("searchResults")


const searchContent=document.querySelector(".search-content")





async function performSearch(query){
  if(!query) return
  if(!searchResults || !searchContent) return

  searchResults.classList.add("active")
  searchContent.innerHTML = `<div style="padding:10px;color:#aaa;">Searching...</div>`

  saveRecentSearch(query)

  try{
    const [tracksRes, artistsRes, albumsRes] = await Promise.all([
      fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=5&search=${encodeURIComponent(query)}`),
      fetch(`https://api.jamendo.com/v3.0/artists/?client_id=${CLIENT_ID}&format=json&limit=3&search=${encodeURIComponent(query)}`),
      fetch(`https://api.jamendo.com/v3.0/albums/?client_id=${CLIENT_ID}&format=json&limit=3&search=${encodeURIComponent(query)}`)
    ])

    const tracksData = await tracksRes.json()
    const artistsData = await artistsRes.json()
    const albumsData = await albumsRes.json()

    searchContent.innerHTML = ""

    const hasTracks = tracksData?.results?.length > 0
    const hasArtists = artistsData?.results?.length > 0
    const hasAlbums = albumsData?.results?.length > 0

    if(!hasTracks && !hasArtists && !hasAlbums){
      searchContent.innerHTML = `
        <div style="padding:10px;color:#aaa;">
          No results found for "<strong>${query}</strong>"
        </div>
      `
      return
    }

    /* SONGS */
    if(hasTracks){
      const title = document.createElement("h4")
      title.innerText = "Songs"
      searchContent.appendChild(title)

      tracksData.results.forEach(item=>{
        const div = document.createElement("div")
        div.className = "search-item"

        div.innerHTML = `
          <img src="${getValidCover(item.album_image)}">
          <div>
            <div>${item.name}</div>
            <div style="font-size:12px;color:#aaa">${item.artist_name}</div>
          </div>
        `

        div.onclick = ()=> navigateToSearchPage("songs", item.name)
        searchContent.appendChild(div)
      })
    }

    /* ARTISTS */
    if(hasArtists){
      const title = document.createElement("h4")
      title.innerText = "Artists"
      searchContent.appendChild(title)

      artistsData.results.forEach(item=>{
        const div = document.createElement("div")
        div.className = "search-item"

        div.innerHTML = `
          <img src="${item.image || DEFAULT_COVER}">
          <div>${item.name}</div>
        `

        div.onclick = ()=> navigateToSearchPage("artist", item.name)
        searchContent.appendChild(div)
      })
    }

    /* ALBUMS */
    if(hasAlbums){
      const title = document.createElement("h4")
      title.innerText = "Albums"
      searchContent.appendChild(title)

      albumsData.results.forEach(item=>{
        const div = document.createElement("div")
        div.className = "search-item"

        div.innerHTML = `
          <img src="${item.image || DEFAULT_COVER}">
          <div>${item.name}</div>
        `

        div.onclick = ()=> navigateToSearchPage("album", item.id)
        searchContent.appendChild(div)
      })
    }

  }catch(err){
    console.error("Search error:", err)
    searchContent.innerHTML = `
      <div style="padding:10px;color:#aaa;">
        Search failed. Please try again.
      </div>
    `
  }
}






/* 
UPDATE LIKED PAGE
 */

function updateLikedPage(){

const likedGrid = document.getElementById("likedGrid")

if(!likedGrid) return

likedGrid.innerHTML = ""

likedSongs.forEach(index => {

likedGrid.appendChild(createSongCard(songs[index], index))

})

}

/* 
REFRESH LIKED PAGE
 */

function refreshLikedPage(){

const likedGrid = document.getElementById("likedGrid")

if(!likedGrid) return

likedGrid.innerHTML = ""

likedSongs.forEach(index => {

likedGrid.appendChild(createSongCard(songs[index], index))

})

}

/* 
LIKE SYSTEM
 */


likeBtn.onclick = () => {

const songId = songs[currentSong].id

if(likedSongs.includes(songId)){

likedSongs = likedSongs.filter(id => id !== songId)

likeBtn.classList.remove("active")

showToast("Removed from liked songs")

}else{

likedSongs.push(songId)

likeBtn.classList.add("active")

showToast("Added to liked songs")

}

/* save */

setUserStorage("likedSongs", likedSongs)

/* UPDATE LIKED PAGE IF OPEN */

updateLikedPage()
refreshLikedPage()

}

likeBtn.classList.add("animate")

setTimeout(()=>{
likeBtn.classList.remove("animate")
},300)




/* 
RENDER FILTERED ROWS
 */

function renderRows(list){
if(!listenRow || !trendingRow || !favoriteRow) return

listenRow.replaceChildren()
trendingRow.replaceChildren()
favoriteRow.replaceChildren()

if(!list || list.length === 0){
listenRow.innerHTML = "<p>No songs found</p>"
return
}

listenData = list.slice(0, 12)
trendingData = list.slice(12, 24)
favoriteData = list.slice(24, 36)

renderListenRow()
renderTrendingRow()
renderFavoriteRow()
}

/* 
HERO RECENT SONG
*/
function loadHeroSong(){

const recent = getUserStorage("recentSong", null)

const heroImage = document.getElementById("heroImage")
const heroTitle = document.getElementById("heroTitle")
const heroArtist = document.getElementById("heroArtist")
const heroPlay = document.getElementById("heroPlay")
const heroSection = document.querySelector(".hero-recommendation")

/* 
🆕 NEW USER (NO HISTORY)
 */
if(!recent){

const hour = new Date().getHours()

let greeting = "Welcome"
if(hour < 12) greeting = "Good Morning ☀️"
else if(hour < 17) greeting = "Good Afternoon 🌤️"
else greeting = "Good Evening 🌙"

/*  Hero UI */
heroSection.innerHTML = `
<div class="welcome-card">
<h2>${greeting}</h2>
<h3>Welcome to Safinex Music 🎧</h3>
<p>Discover songs, artists and playlists made for you.</p>
<button id="startExplore">Start Exploring</button>
</div>
`

/* CTA */
document.getElementById("startExplore").onclick = () => {
navigate("explore")
}

return
}

/* 
 EXISTING USER (NORMAL FLOW)
 */

heroImage.src = getValidCover(recent.cover)
heroTitle.textContent = recent.title
heroArtist.textContent = recent.artist

if(bgBlur){
bgBlur.style.backgroundImage = `url(${getValidCover(recent.cover)})`
}

if(heroPlay){
heroPlay.onclick = () => {
const index = songs.findIndex(song => song.id === recent.id)
if(index !== -1){
currentSong = index

loadSong(index, true)

}
}
}

}

/* 
LOAD ROUTE FROM URL
*/

async function loadRouteFromURL(){
  let path = window.location.hash.replace("#/", "").trim()

  if(path === ""){
    path = "home"
  }

  await navigateWithoutPush(path)
}

/*  INITIAL ROUTE FIX  */
if(!window.location.hash){
  history.replaceState({}, "", "/#/home")
}

/*  APP BOOT */
async function bootApp(){
  try{
    syncUserMusicState()
    initTopNavbar()  
    // preload songs once before first render
    if(songs.length === 0){
      await loadSongsFromAPI()
    }

    await loadRouteFromURL()

    renderRecentSearches()
    renderTrending()
    updatePlaybackBadge("online", true)
  }catch(err){
    console.error("BOOT ERROR:", err)
    showToast("Failed to load app")
    await renderHome()
  }
}

bootApp()




/* 
SIDEBAR OPEN / CLOSE
 */

const menuToggle = document.getElementById("menuToggle")
const sidebar = document.querySelector(".sidebar")

menuToggle.addEventListener("click", () => {

sidebar.classList.toggle("collapsed")

menuToggle.classList.toggle("active")

})


const queuePanel = document.getElementById("queuePanel")
queuePanel.addEventListener("click", (e)=>{
   e.stopPropagation()
})

const queueBtn = document.getElementById("queueBtn")
const closeQueue = document.getElementById("closeQueue")
closeQueue.addEventListener("click", (e)=>{
   e.stopPropagation()   // prevent global click
   queuePanel.classList.remove("active")
})

queueBtn.addEventListener("click", (e) => {
e.stopPropagation()

document.querySelectorAll(".song-menu.active")
.forEach(m => m.classList.remove("active"))

queuePanel.classList.toggle("active")
})

/*  NAVBAR INIT (ADD THIS) */
function initTopNavbar(){
  renderRecentSearches()
  renderTrending()

  if(profileBtn){
    profileBtn.setAttribute("title", "Open Profile")
  }

  if(searchInput){
    searchInput.setAttribute("autocomplete", "off")
  }
}

/*  TOAST FEEDBACK  */
function showToast(text){

let toast = document.createElement("div")

toast.className = "toast"
toast.innerText = text

document.body.appendChild(toast)

setTimeout(()=>{
toast.classList.add("show")
},50)

setTimeout(()=>{
toast.classList.remove("show")
setTimeout(()=>toast.remove(),300)
},2000)

}



/* 
REINITIALIZE HOME PAGE EVENTS
 */

function initHomeInteractions(){

/*
CATEGORY FILTER
 */

const chips = document.querySelectorAll(".chip")

chips.forEach(chip => {

	

chip.onclick = async () => {
	if(songs.length < 50){
await loadSongsFromAPI()
}

/* ACTIVE UI */
chips.forEach(c => c.classList.remove("active"))
chip.classList.add("active")

const mood = chip.dataset.mood

trendingPage = 0
trendingData = []
favoriteData = []


/* SHOW SKELETON ONCE */
showSkeleton("listen")
showSkeleton("trending")
showSkeleton("favorite")

/* 
ALL CATEGORY 
*/
if(mood === "all"){

listenData = []
trendingData = []
favoriteData = []
trendingPage = 0

showSkeleton("listen")
showSkeleton("trending")
showSkeleton("favorite")

await loadHomeSections()

return
}
/* 
CACHE CHECK (NEW)
*/

if(chipCache[mood]){

/* 🔥 RE-BIND DOM */
listenRow = document.getElementById("listenRow")
trendingRow = document.getElementById("trendingRow")
favoriteRow = document.getElementById("favoriteRow")

listenData = chipCache[mood].listen
trendingData = chipCache[mood].trending
favoriteData = chipCache[mood].favorite

removeSkeletonSmooth()
listenRow.replaceChildren()
trendingRow.replaceChildren()
favoriteRow.replaceChildren()

renderListenRow()
renderTrendingRow()
renderFavoriteRow()
return
}

/* 
FETCH FROM API
 */

try{

let allResults = []

/*  USE PRELOADED DATA FIRST */
if(chipPreload[mood]){
   allResults = chipPreload[mood]
}else{
   const tags = moodTags[mood].split(",")

   for(const tag of tags){
      const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=20&tags=${tag.trim()}&audioformat=mp3`
      
      const res = await fetch(url)
      const data = await res.json()

      if(data.results){
         allResults = [...allResults, ...data.results]
      }
   }
}


const moodSongs = allResults

const uniqueSongs = []
const seen = new Set()

moodSongs.forEach(song=>{
   if(!seen.has(song.id)){
      seen.add(song.id)
      uniqueSongs.push(song)
   }
})

/* ✅ SORT AFTER BUILDING LIST */
const smartSongs = smartSortSongs(uniqueSongs)


uniqueSongs.forEach(song=>{
if(!songs.some(s => s.id === song.id)){
songs.push(song)
}
})

/* 
 ENSURE FULL 3 SECTIONS LOAD
 */

/* take available mood songs */
/*  ENSURE MINIMUM DATA */
const baseList = smartSongs.length ? smartSongs : uniqueSongs

listenData = baseList.slice(0, 12)
trendingData = baseList.slice(12, 24)
favoriteData = baseList.slice(24, 36)

/*  STRONG FALLBACK (NO EMPTY UI) */
const fillFromGlobal = (arr, count) => {
   if(arr.length >= count) return arr

   const needed = count - arr.length

   const extra = songs
      .filter(s => !arr.some(a => a.id === s.id))
      .slice(0, needed)

   return [...arr, ...extra]
}

listenData = fillFromGlobal(listenData, 12)
trendingData = fillFromGlobal(trendingData, 12)
favoriteData = fillFromGlobal(favoriteData, 12)


/*  FILL MISSING FROM GLOBAL SONGS */
if(listenData.length < 12){
listenData = [
...listenData,
...songs.slice(0, 12 - listenData.length)
]
}

if(trendingData.length < 12){
trendingData = [
...trendingData,
...songs.slice(0, 12 - trendingData.length)
]
}

if(favoriteData.length < 12){
favoriteData = [
...favoriteData,
...songs.slice(0, 12 - favoriteData.length)
]
}

/*  SAVE CACHE */
chipCache[mood] = {
listen: listenData,
trending: trendingData,
favorite: favoriteData
}

removeSkeletonSmooth()

listenRow.replaceChildren()
trendingRow.replaceChildren()
favoriteRow.replaceChildren()


renderListenRow()
renderTrendingRow()
renderFavoriteRow()

}catch(err){
console.error("Chip load error:", err)
}

}

})

/* 
ROW CONTROLS 
 */

document.querySelectorAll(".music-row").forEach((row, rowIndex) => {

const container = row.querySelector(".row-container")
const leftBtn = row.querySelector(".scroll-left")
const rightBtn = row.querySelector(".scroll-right")

if(!container || !leftBtn || !rightBtn) return

/* LEFT BUTTON */

leftBtn.onclick = () => {
container.scrollBy({
left: -container.clientWidth,
behavior: "smooth"
})
}

/* RIGHT BUTTON */

rightBtn.onclick = async () => {

container.scrollBy({
left: container.clientWidth,
behavior: "smooth"
})

/* LOAD MORE ONLY FOR THAT ROW */

if(rowIndex === 0){
loadListenAgain()
}

if(rowIndex === 1){
await loadTrending()
}

if(rowIndex === 2){
loadFavorites()
}

}

})

}


/* HERO PLAY BUTTON */

const heroPlay = document.getElementById("heroPlay")

if (heroPlay) {
	// Remove any previous click event to prevent multiple listeners
	heroPlay.onclick = null;

	heroPlay.onclick = () => {
const recentRaw = getUserStorage("recentSong", null)
const recent = recentRaw ? {
...recentRaw,
cover: getValidCover(recentRaw.cover)
} : null
		if (!recent) return

		const index = songs.findIndex(s => s.id === recent.id)

		if (index !== -1) {
			currentSong = index
         loadSong(index, true)
		}
	}
}




let recentSearches = []

function saveRecentSearch(query){
   if(recentSearches.includes(query)) return

   recentSearches.unshift(query)
   recentSearches = recentSearches.slice(0, 5)

   setUserStorage("recentSearches", recentSearches)
   renderRecentSearches()
}

function renderRecentSearches(){

const list = document.getElementById("recentSearchList")
if(!list) return

list.innerHTML=""

/* LABEL */
if(recentSearches.length > 0){

const label = document.createElement("div")
label.className = "search-label"
label.innerText = "Recent Searches"

list.appendChild(label)
}

/*  */
recentSearches.forEach(q=>{
const item = document.createElement("div")
item.className = "search-item"
item.innerText = q

item.onclick = ()=>{
searchInput.value = q
performSearch(q)
}

list.appendChild(item)
})

}


const trendingKeywords=[
"lofi",
"chill",
"ambient",
"study",
"coding",
"piano"
]

function renderTrending(){

const list=document.getElementById("trendingSearchList")

if(!list) return

list.innerHTML=""

trendingKeywords.forEach(word=>{

const item=document.createElement("div")

item.className="search-item"

item.innerText=word

item.onclick=()=>{
searchInput.value=word
performSearch(word)
}

list.appendChild(item)

})

}

/*
SEARCH RESULT PAGE (PREMIUM)
 */
async function navigateToSearchPage(type, value){
  currentSearchType = type
  currentSearchValue = value

  if(searchResults){
    searchResults.classList.remove("active")
  }

  await navigate("search")
}



function renderSearchGrid(list, grid){
  grid.innerHTML = ""

  if(!list || list.length === 0){
    grid.innerHTML = `
      <p style="color:#aaa; font-size:14px;">
        No songs found for this search
      </p>
    `
    return
  }

  const fragment = document.createDocumentFragment()

  list.forEach(track=>{
    const song = {
      id: track.id,
      title: track.name,
      artist: track.artist_name,
      cover: getValidCover(track.album_image),
      src: track.audio,
      mood: detectCategory(Array.isArray(track.tags) ? track.tags : []),
      tags: Array.isArray(track.tags) ? track.tags : []
    }

    if(!songs.some(s => s.id === song.id)){
      songs.push(song)
    }

    const index = songs.findIndex(s => s.id === song.id)
    fragment.appendChild(createSongCard(song, index))
  })

  grid.appendChild(fragment)
}



function showSkeletonGrid(grid){

grid.innerHTML = ""

for(let i=0;i<10;i++){

const sk = document.createElement("div")
sk.className = "song-card skeleton"

sk.innerHTML = `
<div class="skeleton-img"></div>
<div class="skeleton-title"></div>
<div class="skeleton-artist"></div>
`

grid.appendChild(sk)

}

}


/* 
GLOBAL CLICK HANDLER 
 */
document.addEventListener("click", (e) => {
if(!e.target.closest(".search-bar")){
if(searchResults){
searchResults.classList.remove("active")
}
}
/* CLOSE ALL SONG MENUS */
document.querySelectorAll(".song-menu.active")
.forEach(menu => {
menu.classList.remove("active")
})

/*  CLOSE QUEUE PANEL */
const queuePanel = document.getElementById("queuePanel")
if(queuePanel && !queuePanel.contains(e.target)){
   queuePanel.classList.remove("active")
}

})



function renderLocal(){
isLocalSession = true
pageContent.innerHTML = `
<div class="local-header">
   <h2>Local Files</h2>
   <button id="toggleSelectModeBtn">Select Songs</button>
</div>

<input type="file" id="localFileInput" multiple accept="audio/*" style="display:none">

<div class="local-upload-area" id="dropZone">
   <div class="upload-progress" id="uploadProgress" style="display:none">
      <div class="progress-bar" id="progressBar"></div>
   </div>
   <i class="fa-solid fa-music upload-icon"></i>
   <p>Drag & Drop Music Here</p>
   <button id="loadLocalBtn" class="glass-btn">Load from Device</button>
</div>

<div class="song-grid" id="localGrid"></div>
`


const btn = document.getElementById("loadLocalBtn")
const fileInput = document.getElementById("localFileInput")
const dropZone = document.getElementById("dropZone")
const grid = document.getElementById("localGrid")

const toggleSelectModeBtn = document.getElementById("toggleSelectModeBtn")

toggleSelectModeBtn.onclick = () => {
   isLocalSelectMode = !isLocalSelectMode
   if(!isLocalSelectMode){
      selectedLocalSongs.clear()
   }
   refreshLocalGrid()
}

btn.onclick = () => fileInput.click()

/* 
FILE INPUT
 */
fileInput.onchange = (e)=>{

const files = Array.from(e.target.files)

/* FILTER AUDIO ONLY */
const audioFiles = files.filter(f => f.type.startsWith("audio"))

if(audioFiles.length === 0){
showToast("Only audio files allowed 🎵")
return
}

handleFiles(audioFiles)

/*  RESET INPUT  */
fileInput.value = ""

}

/* 
DRAG & DROP
*/
dropZone.ondragover = (e)=>{
e.preventDefault()
dropZone.classList.add("dragover")
}

dropZone.ondragleave = ()=>{
dropZone.classList.remove("dragover")
}

dropZone.ondrop = (e)=>{
e.preventDefault()
dropZone.classList.remove("dragover")

const files = Array.from(e.dataTransfer.files)

/* 🔥 FILTER AUDIO ONLY */
const audioFiles = files.filter(f => f.type.startsWith("audio"))

if(audioFiles.length === 0){
dropZone.classList.add("invalid")
showToast("Only audio files allowed 🎵")

setTimeout(()=>{
dropZone.classList.remove("invalid")
},1500)

return
}

handleFiles(audioFiles)
}
/* 
LOAD FROM DB ON OPEN
 */
loadLocalFromDB()
renderLocalActionBar()

}



function renderAbout(){

   const year = new Date().getFullYear()
   const version = "v1.0.0"

   pageContent.innerHTML = `
   <div class="about-container">

      <!-- 🔥 HERO SECTION -->
      <div class="about-hero">
         <img src="assets/logo.png" class="about-logo">
         <h1>Safinex Music</h1>
         <p>AI-powered next-gen music experience</p>
         <span class="version">${version}</span>
      </div>

      <!-- 🚀 FEATURES -->
      <div class="about-card">
         <h3><i class="fa-solid fa-bolt"></i> Features</h3>
         <div class="about-grid">
            <div class="about-item">🎧 Smart AI Recommendations</div>
            <div class="about-item">⚡ Zero-lag UI Experience</div>
            <div class="about-item">🎯 Mood-based Filtering</div>
            <div class="about-item">📂 Local File Support</div>
            <div class="about-item">🔍 Advanced Search</div>
            <div class="about-item">📊 Smart Queue System</div>
         </div>
      </div>

      <!-- 📖 HOW TO USE -->
      <div class="about-card">
         <h3><i class="fa-solid fa-book"></i> How to Use</h3>
         <ul>
            <li>Use <b>Home</b> for personalized recommendations</li>
            <li>Explore unlimited songs in <b>Explore</b></li>
            <li>Click any track to play instantly</li>
            <li>Use mood chips to filter songs</li>
            <li>Manage queue for continuous playback</li>
            <li>Upload songs via Local Files</li>
         </ul>
      </div>

      <!-- 🧠 AI ENGINE -->
      <div class="about-card highlight">
         <h3><i class="fa-solid fa-brain"></i> AI Recommendation Engine</h3>
         <p>
            Safinex Music uses behavior-based learning — tracking your listening patterns,
            moods, and interactions to dynamically adapt recommendations and queue.
         </p>
      </div>

      <!-- 👨‍💻 DEVELOPER -->
      <div class="about-card dev-card">
         <h3><i class="fa-solid fa-user"></i> Developer</h3>
         <p><b>SK Safiur Rahaman</b></p>
         <p>Founder — Safinex Software Solutions</p>
         <p>Building AI-driven web applications</p>
      </div>

      <!-- © FOOTER -->
      <div class="about-footer">
         <p>© ${year} Safinex Software Solutions</p>
         <p>All Rights Reserved</p>
      </div>

   </div>
   `
}


async function renderSearchPage(){
  pageContent.innerHTML = `
    <h2 style="margin-bottom:20px">Search Results</h2>
    <p style="color:#aaa; margin-bottom:16px; font-size:14px;">
      Showing results for: <strong>${currentSearchValue || "Unknown"}</strong>
    </p>
    <div class="song-grid" id="searchPageGrid"></div>
  `

  const grid = document.getElementById("searchPageGrid")
  if(!grid) return

  showSkeletonGrid(grid)

  try{
    let url = ""

    if(currentSearchType === "songs"){
      url = `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=30&search=${encodeURIComponent(currentSearchValue)}`
    }

    if(currentSearchType === "artist"){
      url = `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=30&artist_name=${encodeURIComponent(currentSearchValue)}`
    }

    if(currentSearchType === "album"){
      url = `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=30&album_id=${currentSearchValue}`
    }

    if(!url){
      grid.innerHTML = `<p style="color:#aaa">No search query found</p>`
      return
    }

    const res = await fetch(url)
    const data = await res.json()

    renderSearchGrid(data.results || [], grid)
  }catch(err){
    console.error("Search page error:", err)
    grid.innerHTML = `<p style="color:#aaa">Failed to load search results</p>`
  }
}





function handleFiles(files){

if(!files || files.length === 0) return	

const progressContainer = document.getElementById("uploadProgress")
const progressBar = document.getElementById("progressBar")

progressContainer.style.display = "block"

let loaded = 0
const total = files.length

files.forEach(file=>{

console.log("Processing:", file.name)	

if(!file.type.startsWith("audio")) return

window.jsmediatags.read(file, {
onSuccess: function(tag){

let cover = ""

if(tag.tags.picture){
let base64String = ""
const data = tag.tags.picture.data
for(let i=0;i<data.length;i++){
base64String += String.fromCharCode(data[i])
}
cover = `data:${tag.tags.picture.format};base64,${btoa(base64String)}`
}else{

if(tag.tags.picture){
/* keep extracted cover */
}else{
cover = DEFAULT_COVER   
}
}



saveLocalSong(
file,
tag.tags.title || file.name,
tag.tags.artist || "Unknown",
cover
)

/* 🔥 UPDATE PROGRESS */
loaded++
progressBar.style.width = ((loaded/total)*100) + "%"

/* 🔥 HIDE WHEN DONE */
if(loaded === total){
setTimeout(()=>{
progressContainer.style.display = "none"
progressBar.style.width = "0%"
},800)
}

},
onError: function(){

/* fallback save */
saveLocalSong(file, file.name, "Unknown", DEFAULT_COVER)

loaded++
progressBar.style.width = ((loaded/total)*100) + "%"

/* finish check */
if(loaded === total){
setTimeout(()=>{
progressContainer.style.display = "none"
progressBar.style.width = "0%"
},800)
}

}
})

})

}

let db

const request = indexedDB.open("SafinexDB", 1)

request.onupgradeneeded = function(e){
db = e.target.result
db.createObjectStore("songs", { keyPath: "id" })
}

request.onsuccess = function(e){
db = e.target.result
}


function saveLocalSong(file, title, artist, cover){

/*  */
if(!db){
console.warn("DB not ready yet")
setTimeout(()=>{
saveLocalSong(file, title, artist, cover)
},500)
return
}

const reader = new FileReader()

reader.onload = function(){

	console.log("Saved:", title)

const cleanTitle = (title || file.name).trim()
const cleanArtist = (artist || "Unknown").trim()

const duplicateExists = songs.some(song =>
   song.isLocal &&
   song.title.trim().toLowerCase() === cleanTitle.toLowerCase() &&
   song.artist.trim().toLowerCase() === cleanArtist.toLowerCase()
)

if(duplicateExists){
   showToast(`Skipped duplicate: ${cleanTitle}`)
   return
}

const songData = {
id: "local_" + Date.now() + Math.random(),
ownerId: getStorageOwnerId(),
title: cleanTitle,
artist: cleanArtist,
cover: cover || generatePremiumCover(cleanTitle),
src: reader.result,
isLocal: true
}

const tx = db.transaction("songs", "readwrite")
const store = tx.objectStore("songs")
store.add(songData)

songs.push(songData)
updatePlayingUI()
refreshLocalGrid()

}

reader.readAsDataURL(file)

}


function loadLocalFromDB(){

if(!db) return

const tx = db.transaction("songs", "readonly")
const store = tx.objectStore("songs")
const request = store.getAll()

request.onsuccess = function(){
   const grid = document.getElementById("localGrid")
   if(!grid) return

   grid.innerHTML = ""

   request.result
   .filter(song => (song.ownerId || GUEST_STORAGE_PREFIX) === getStorageOwnerId())
   .forEach(song => {
      const localSong = {
         ...song,
         isLocal: true // 🔥 force safety
      }

      if(!songs.some(s => s.id === localSong.id)){
         songs.push(localSong)
      }else{
         const existingIndex = songs.findIndex(s => s.id === localSong.id)
         songs[existingIndex] = localSong
      }

      const index = songs.findIndex(s => s.id === localSong.id)
      grid.appendChild(createSongCard(localSong, index))
   })
}

}

function deleteLocalSongFromDB(songId){
   if(!db) return

   const tx = db.transaction("songs", "readwrite")
   const store = tx.objectStore("songs")
   store.delete(songId)
}

function deleteMultipleLocalSongs(songIds){
   if(!db || !songIds.length) return

   const tx = db.transaction("songs", "readwrite")
   const store = tx.objectStore("songs")

   songIds.forEach(id => store.delete(id))
}

function refreshLocalGrid(){
   if(currentPageName !== "local") return

   const grid = document.getElementById("localGrid")
   if(!grid) return

   grid.innerHTML = ""

   const localSongs = getLocalSongs()

   if(localSongs.length === 0){
      grid.innerHTML = `
         <p style="color:#aaa;font-size:14px">
            No local songs uploaded yet
         </p>
      `
      return
   }

   localSongs.forEach(song => {
      const index = songs.findIndex(s => s.id === song.id)
      if(index !== -1){
         grid.appendChild(createSongCard(song, index))
      }
   })

   renderLocalActionBar()
}

function exitLocalSelectMode(){
   isLocalSelectMode = false
   selectedLocalSongs.clear()
   refreshLocalGrid()
}

function renderLocalActionBar(){
   const existing = document.getElementById("localActionsBar")
   if(existing) existing.remove()

   if(currentPageName !== "local") return

   const page = document.getElementById("pageContent")
   if(!page) return

   const bar = document.createElement("div")
   bar.id = "localActionsBar"
   bar.className = `local-actions-bar ${isLocalSelectMode ? "active" : ""}`

   bar.innerHTML = `
      <span id="selectedCount">${selectedLocalSongs.size} selected</span>
      <button id="deleteSelectedBtn" class="danger-btn">Delete Selected</button>
      <button id="cancelSelectBtn" class="ghost-btn">Cancel</button>
   `

   page.appendChild(bar)

   document.getElementById("deleteSelectedBtn").onclick = deleteSelectedLocalSongs
   document.getElementById("cancelSelectBtn").onclick = exitLocalSelectMode
}

function deleteSelectedLocalSongs(){
   const ids = Array.from(selectedLocalSongs)
   if(ids.length === 0){
      showToast("No songs selected")
      return
   }

   // if currently playing song is deleted → stop playback safely
   const currentSongObj = songs[currentSong]
   const deletingCurrent = currentSongObj && ids.includes(currentSongObj.id)

   deleteMultipleLocalSongs(ids)

   songs = songs.filter(song => !ids.includes(song.id))
   queue = []

   if(deletingCurrent){
      audio.pause()
      audio.src = ""
      songName.textContent = "Song Title"
      artistName.textContent = "Artist"
      playerCover.src = ""
      musicPlayer.classList.remove("active")
      updatePlaybackBadge("online", true)
   }

   showToast(`${ids.length} song(s) deleted`)
   exitLocalSelectMode()
}



function updatePlayingUI(){

/* 🔥 RESET PREVIOUS */
const prev = document.querySelector(".song-card.playing")
if(prev){
prev.classList.remove("playing")

const icon = prev.querySelector(".play-overlay i")
if(icon){
icon.className = "fa-solid fa-play"
}
}

/* 🔥 CURRENT SONG */
const current = document.querySelector(`[data-index="${currentSong}"]`)
if(current){

current.classList.add("playing")

const icon = current.querySelector(".play-overlay i")
if(icon){
icon.className = audio.paused
? "fa-solid fa-play"
: "fa-solid fa-pause"
}
}

}

document.addEventListener("visibilitychange", ()=>{
   if(!document.hidden){
      generateSmartQueue()
   }
})




/* ===============================
   ACCOUNT SYSTEM - STAGE 2 FOUNDATION
=============================== */
const DEFAULT_AVATAR = "assets/default-avatar.png"

/* NAV UI */
const profileBtn = document.getElementById("profileBtn")
const profileDropdown = document.getElementById("profileDropdown")
const navProfileImage = document.getElementById("navProfileImage")
const dropdownProfileImage = document.getElementById("dropdownProfileImage")
const dropdownUserName = document.getElementById("dropdownUserName")
const dropdownUserEmail = document.getElementById("dropdownUserEmail")

const openAuthModalBtn = document.getElementById("openAuthModalBtn")
const openAccountPageBtn = document.getElementById("openAccountPageBtn")

/* AUTH MODAL */
const authModal = document.getElementById("authModal")
const authModalBackdrop = document.getElementById("authModalBackdrop")
const closeAuthModal = document.getElementById("closeAuthModal")

const authTabs = document.querySelectorAll(".auth-tab")
const loginPanel = document.getElementById("loginPanel")
const signupPanel = document.getElementById("signupPanel")

/* AUTH INPUTS */
const loginEmailInput = document.getElementById("loginEmailInput")
const loginPasswordInput = document.getElementById("loginPasswordInput")
const loginSubmitBtn = document.getElementById("loginSubmitBtn")

const signupNameInput = document.getElementById("signupNameInput")
const signupEmailInput = document.getElementById("signupEmailInput")
const signupPasswordInput = document.getElementById("signupPasswordInput")
const signupConfirmPasswordInput = document.getElementById("signupConfirmPasswordInput")
const signupSubmitBtn = document.getElementById("signupSubmitBtn")

/* STORAGE KEYS */
const ACCOUNTS_STORAGE_KEY = "safinex_accounts"
const SESSION_STORAGE_KEY = "safinex_current_session"

const GUEST_STORAGE_PREFIX = "guest"

/* ===============================
   USER-SCOPED STORAGE HELPERS
=============================== */
function getStorageOwnerId(){
   return getCurrentUser()?.id || GUEST_STORAGE_PREFIX
}

function buildUserStorageKey(key){
   return `safinex_user_${getStorageOwnerId()}_${key}`
}

function getUserStorage(key, fallback = null){
   try{
      const raw = localStorage.getItem(buildUserStorageKey(key))
      return raw ? JSON.parse(raw) : fallback
   }catch{
      return fallback
   }
}

function setUserStorage(key, value){
   localStorage.setItem(buildUserStorageKey(key), JSON.stringify(value))
}

function removeUserStorage(key){
   localStorage.removeItem(buildUserStorageKey(key))
}

/* ===============================
   USER MUSIC STATE REFS
=============================== */
function syncUserMusicState(){
   likedSongs = getUserStorage("likedSongs", []) || []
   userProfile = getUserStorage("userProfile", {
      moods: {},
      artists: {},
      songs: {},
      recent: [],
      lastUpdated: Date.now()
   }) || {
      moods: {},
      artists: {},
      songs: {},
      recent: [],
      lastUpdated: Date.now()
   }

   recentSearches = getUserStorage("recentSearches", []) || []

   renderRecentSearches?.()
   updateLikedPage?.()
   refreshLikedPage?.()
}

function saveUserProfile(){
   setUserStorage("userProfile", userProfile)
}

/* ACCOUNT STATE */
let accountsDB = JSON.parse(localStorage.getItem(ACCOUNTS_STORAGE_KEY)) || []
let currentSession = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)) || null

/* ===============================
   HELPERS
=============================== */
function saveAccountsDB(){
   localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accountsDB))
}

function saveCurrentSession(){
   localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentSession))
}

function getCurrentUser(){
   if(!currentSession?.userId) return null
   return accountsDB.find(user => user.id === currentSession.userId) || null
}

function isUserLoggedIn(){
   return !!getCurrentUser()
}

function generateUserId(){
   return "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9)
}

function normalizeEmail(email){
   return (email || "").trim().toLowerCase()
}

/* ===============================
   AUTH VALIDATION + ACCOUNT HELPERS
=============================== */
function findUserByEmail(email){
   const normalized = normalizeEmail(email)
   return accountsDB.find(user => normalizeEmail(user.email) === normalized) || null
}

function validateEmail(email){
   return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePassword(password){
   return typeof password === "string" && password.trim().length >= 6
}

function hashPassword(password){
   // simple local-app safe placeholder hash structure
   // scalable later for backend auth migration
   return btoa(unescape(encodeURIComponent(password)))
}

function verifyPassword(rawPassword, hashedPassword){
   return hashPassword(rawPassword) === hashedPassword
}

function createNewAccount({ name, email, password }){
   const newUser = {
      id: generateUserId(),
      name: name.trim(),
      email: normalizeEmail(email),
      passwordHash: hashPassword(password),
      avatar: DEFAULT_AVATAR,
      provider: "local",
      plan: "Free",
      createdAt: Date.now(),
      updatedAt: Date.now()
   }

   accountsDB.push(newUser)
   saveAccountsDB()
   return newUser
}

function startUserSession(user){
   currentSession = {
      userId: user.id,
      loginAt: Date.now(),
      provider: user.provider || "local"
   }

   saveCurrentSession()
   syncUserMusicState()
   updateProfileUI()
}

function clearUserSession(){
   currentSession = null
   saveCurrentSession()
   syncUserMusicState()
   updateProfileUI()
}

function resetAuthInputs(){
   if(loginEmailInput) loginEmailInput.value = ""
   if(loginPasswordInput) loginPasswordInput.value = ""

   if(signupNameInput) signupNameInput.value = ""
   if(signupEmailInput) signupEmailInput.value = ""
   if(signupPasswordInput) signupPasswordInput.value = ""
   if(signupConfirmPasswordInput) signupConfirmPasswordInput.value = ""
}

function safelyGoHomeAfterAuth(){
   closeAuthModalUI()
   navigate("home")
}

function getSafeUserView(){
   const user = getCurrentUser()

   if(!user){
      return {
         id: null,
         name: "Guest User",
         email: "Not signed in",
         avatar: DEFAULT_AVATAR,
         provider: "local",
         plan: "Guest"
      }
   }

   return {
      id: user.id,
      name: user.name || "Safinex User",
      email: user.email || "No email",
      avatar: user.avatar || DEFAULT_AVATAR,
      provider: user.provider || "local",
      plan: user.plan || "Free"
   }
}

/* ===============================
   PROFILE UI INIT
=============================== */
function initProfileSystem(){
   updateProfileUI()

   if(profileBtn){
      profileBtn.addEventListener("click", (e)=>{
         e.stopPropagation()
         profileDropdown.classList.toggle("active")
      })
   }

   if(openAuthModalBtn){
      openAuthModalBtn.addEventListener("click", async ()=>{
         profileDropdown.classList.remove("active")

         if(isUserLoggedIn()){
            await navigate("account")
         }else{
            openAuthModalUI("login")
         }
      })
   }

   if(openAccountPageBtn){
      openAccountPageBtn.addEventListener("click", async ()=>{
         profileDropdown.classList.remove("active")
         await navigate("account")
      })
   }

   if(authModalBackdrop){
      authModalBackdrop.addEventListener("click", closeAuthModalUI)
   }

   if(closeAuthModal){
      closeAuthModal.addEventListener("click", closeAuthModalUI)
   }

   authTabs.forEach(tab=>{
      tab.addEventListener("click", ()=>{
         switchAuthTab(tab.dataset.authTab)
      })
   })

   if(loginSubmitBtn){
      loginSubmitBtn.addEventListener("click", handleLogin)
   }

   if(signupSubmitBtn){
      signupSubmitBtn.addEventListener("click", handleCreateAccount)
   }

   if(loginPasswordInput){
      loginPasswordInput.addEventListener("keydown", (e)=>{
         if(e.key === "Enter"){
            handleLogin()
         }
      })
   }

   if(signupConfirmPasswordInput){
      signupConfirmPasswordInput.addEventListener("keydown", (e)=>{
         if(e.key === "Enter"){
            handleCreateAccount()
         }
      })
   }

   bootPersistentSession()
}

function switchAuthTab(type){
   authTabs.forEach(t=>t.classList.remove("active"))

   const activeTab = document.querySelector(`[data-auth-tab="${type}"]`)
   if(activeTab) activeTab.classList.add("active")

   if(type === "login"){
      loginPanel.classList.add("active")
      signupPanel.classList.remove("active")
   }else{
      signupPanel.classList.add("active")
      loginPanel.classList.remove("active")
   }
}

function openAuthModalUI(type = "login"){
   switchAuthTab(type)
   authModal.classList.add("active")
}

function closeAuthModalUI(){
   authModal.classList.remove("active")
}

/* ===============================
   REAL AUTH ACTIONS
=============================== */
function handleCreateAccount(){
   const name = signupNameInput?.value?.trim() || ""
   const email = signupEmailInput?.value?.trim() || ""
   const password = signupPasswordInput?.value || ""
   const confirmPassword = signupConfirmPasswordInput?.value || ""

   if(!name){
      showToast("Enter your full name")
      return
   }

   if(name.length < 2){
      showToast("Name is too short")
      return
   }

   if(!validateEmail(email)){
      showToast("Enter a valid email")
      return
   }

   if(findUserByEmail(email)){
      showToast("Account already exists")
      switchAuthTab("login")
      if(loginEmailInput) loginEmailInput.value = email
      return
   }

   if(!validatePassword(password)){
      showToast("Password must be at least 6 characters")
      return
   }

   if(password !== confirmPassword){
      showToast("Passwords do not match")
      return
   }

   const newUser = createNewAccount({ name, email, password })

   startUserSession(newUser)
   resetAuthInputs()
   updateProfileUI()

   showToast("Account created successfully")
   safelyGoHomeAfterAuth()
}

function handleLogin(){
   const email = loginEmailInput?.value?.trim() || ""
   const password = loginPasswordInput?.value || ""

   if(!validateEmail(email)){
      showToast("Enter a valid email")
      return
   }

   if(!password){
      showToast("Enter your password")
      return
   }

   const user = findUserByEmail(email)

   if(!user){
      showToast("No account found")
      switchAuthTab("signup")
      if(signupEmailInput) signupEmailInput.value = email
      return
   }

   if(!verifyPassword(password, user.passwordHash)){
      showToast("Incorrect password")
      return
   }

   startUserSession(user)
   resetAuthInputs()
   updateProfileUI()

   showToast("Logged in successfully")
   safelyGoHomeAfterAuth()
}

async function handleLogout(){
  clearUserSession()
  closeAuthModalUI()
  profileDropdown?.classList.remove("active")

  showToast("Logged out successfully")

  if(currentPageName === "account"){
    await navigate("home")
  }else{
    updateProfileUI()
  }
}


/* ===============================
   NAVBAR PROFILE UI
=============================== */
function updateProfileUI(){
   const user = getSafeUserView()
   const avatar = user.avatar || DEFAULT_AVATAR
   const hasCustomAvatar =
      avatar &&
      avatar !== DEFAULT_AVATAR &&
      avatar.trim() !== ""

   if(navProfileImage){
      navProfileImage.src = avatar
   }

   if(dropdownProfileImage){
      dropdownProfileImage.src = avatar
   }

   if(dropdownUserName){
      dropdownUserName.textContent = user.name
   }

   if(dropdownUserEmail){
      dropdownUserEmail.textContent = user.email
   }

   if(profileBtn){
      if(hasCustomAvatar){
         profileBtn.classList.remove("no-image")
      }else{
         profileBtn.classList.add("no-image")
      }
   }

   if(openAuthModalBtn){
      openAuthModalBtn.innerHTML = isUserLoggedIn()
         ? `<span class="material-icons">manage_accounts</span> Account Dashboard`
         : `<span class="material-icons">login</span> Login / Sign Up`
   }
}

/* ===============================
   PERSISTENT SESSION BOOT
=============================== */
function bootPersistentSession(){
   if(!currentSession?.userId){
      syncUserMusicState()
      return
   }

   const user = getCurrentUser()

   if(!user){
      clearUserSession()
      return
   }

   syncUserMusicState()
   updateProfileUI()
}

/* ===============================
   ACCOUNT PAGE RENDER
=============================== */
function renderAccountPage(){
   currentPageName = "account"

   const user = getSafeUserView()
   const loggedIn = isUserLoggedIn()

   pageContent.innerHTML = `
      <div class="account-page">
         <div class="account-hero">
            <div class="account-hero-left">
               <div class="account-avatar-wrap">
                  <img id="accountProfileImage" src="${user.avatar}" alt="Profile">
                  <label class="account-avatar-upload" for="accountImageInput">Change</label>
                  <input type="file" id="accountImageInput" accept="image/*" style="display:none">
               </div>

               <div class="account-hero-text">
                  <h2>${user.name}</h2>
                  <p>${user.email}</p>
               </div>
            </div>

            <button class="account-back-btn" id="backToHomeBtn">← Back to Home</button>
         </div>

         <div class="account-grid">
            <div class="account-card">
               <h3>Profile Overview</h3>

               <div class="account-info-row">
                  <span>Name</span>
                  <span id="accountNameText">${user.name}</span>
               </div>

               <div class="account-info-row">
                  <span>Email</span>
                  <span id="accountEmailText">${user.email}</span>
               </div>

               <div class="account-info-row">
                  <span>Account Type</span>
                  <span>${loggedIn ? "Local Account" : "Guest"}</span>
               </div>

               <div class="account-info-row">
                  <span>Provider</span>
                  <span>${user.provider === "google" ? "Google" : "Local"}</span>
               </div>
            </div>

            <div class="account-card">
               <h3>Quick Actions</h3>

               ${
                  loggedIn
                  ? `
                     <button id="logoutBtn" class="profile-action-btn">
                        <span class="material-icons">logout</span>
                        Logout
                     </button>
                  `
                  : `
                     <button id="openAuthFromAccountBtn" class="profile-action-btn">
                        <span class="material-icons">login</span>
                        Open Login / Sign Up
                     </button>
                  `
               }

               <button id="triggerAvatarChangeBtn" class="profile-action-btn">
                  <span class="material-icons">photo_camera</span>
                  Update Profile Photo
               </button>

               <button id="openEditProfileBtn" class="profile-action-btn">
                  <span class="material-icons">edit</span>
                  Edit Profile
               </button>

               <button id="openChangePasswordBtn" class="profile-action-btn">
                  <span class="material-icons">lock</span>
                  Change Password
               </button>

               <button class="profile-action-btn" disabled>
                  <span class="material-icons">link</span>
                  Google Login (Coming Soon)
               </button>
            </div>

            ${
               !loggedIn
               ? `
                  <div class="account-card account-form-card">
                     <h3>Guest Mode</h3>
                     <p style="color:#aaa; line-height:1.7; font-size:14px;">
                        Create an account to save your identity, profile image, and personalized player experience across sessions.
                     </p>
                  </div>
               `
               : ``
            }
         </div>

         ${
            loggedIn
            ? `
            <!-- EDIT PROFILE PANEL -->
            <div id="editProfilePanel" class="account-floating-panel hidden">
               <div class="panel-card">
                  <div class="panel-header">
                     <h3>Edit Profile</h3>
                     <button class="panel-close-btn" id="closeEditProfileBtn">✕</button>
                  </div>

                  <input id="editNameInput" type="text" placeholder="Full Name" value="${user.name}">
                  <input id="editEmailInput" type="email" placeholder="Email Address" value="${user.email}">

                  <button id="saveProfileBtn" class="auth-submit-btn">Save Profile</button>
               </div>
            </div>

            <!-- CHANGE PASSWORD PANEL -->
            <div id="changePasswordPanel" class="account-floating-panel hidden">
               <div class="panel-card">
                  <div class="panel-header">
                     <h3>Change Password</h3>
                     <button class="panel-close-btn" id="closePasswordBtn">✕</button>
                  </div>

                  <input id="currentPasswordInput" type="password" placeholder="Current Password">
                  <input id="newPasswordInput" type="password" placeholder="New Password">
                  <input id="confirmNewPasswordInput" type="password" placeholder="Confirm New Password">

                  <button id="changePasswordBtn" class="auth-submit-btn">Update Password</button>
               </div>
            </div>
            `
            : ``
         }
      </div>
   `


   

   updateSidebarActive("")

   const backToHomeBtn = document.getElementById("backToHomeBtn")
   if(backToHomeBtn){
      backToHomeBtn.onclick = ()=> navigate("home")
   }

   const openAuthFromAccountBtn = document.getElementById("openAuthFromAccountBtn")
   if(openAuthFromAccountBtn){
      openAuthFromAccountBtn.onclick = ()=> openAuthModalUI("login")
   }

   const triggerAvatarChangeBtn = document.getElementById("triggerAvatarChangeBtn")
   const accountImageInput = document.getElementById("accountImageInput")

   if(triggerAvatarChangeBtn && accountImageInput){
      triggerAvatarChangeBtn.onclick = ()=> accountImageInput.click()
   }

   if(accountImageInput){
      accountImageInput.addEventListener("change", handleAccountProfileImageUpload)
   }

   const logoutBtn = document.getElementById("logoutBtn")
   if(logoutBtn){
      logoutBtn.onclick = handleLogout
   }

      const editPanel = document.getElementById("editProfilePanel")
   const passwordPanel = document.getElementById("changePasswordPanel")

   const openEditBtn = document.getElementById("openEditProfileBtn")
   const openPasswordBtn = document.getElementById("openChangePasswordBtn")

   const closeEditBtn = document.getElementById("closeEditProfileBtn")
   const closePasswordBtn = document.getElementById("closePasswordBtn")

   if(openEditBtn && editPanel){
      openEditBtn.onclick = ()=>{
         editPanel.classList.remove("hidden")
      }
   }

   if(openPasswordBtn && passwordPanel){
      openPasswordBtn.onclick = ()=>{
         passwordPanel.classList.remove("hidden")
      }
   }

   if(closeEditBtn && editPanel){
      closeEditBtn.onclick = ()=>{
         editPanel.classList.add("hidden")
      }
   }

   if(closePasswordBtn && passwordPanel){
      closePasswordBtn.onclick = ()=>{
         passwordPanel.classList.add("hidden")
      }
   }

   const saveProfileBtn = document.getElementById("saveProfileBtn")
   if(saveProfileBtn){
      saveProfileBtn.onclick = handleSaveProfileFromAccountPage
   }

   const changePasswordBtn = document.getElementById("changePasswordBtn")
   if(changePasswordBtn){
      changePasswordBtn.onclick = handlePasswordChangeFromAccountPage
   }

   const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput")
   if(confirmNewPasswordInput){
      confirmNewPasswordInput.addEventListener("keydown", (e)=>{
         if(e.key === "Enter"){
            handlePasswordChangeFromAccountPage()
         }
      })
   }

   const editEmailInput = document.getElementById("editEmailInput")
   if(editEmailInput){
      editEmailInput.addEventListener("keydown", (e)=>{
         if(e.key === "Enter"){
            handleSaveProfileFromAccountPage()
         }
      })
   }
}



/* ===============================
   ACCOUNT PROFILE UPDATE HELPERS
=============================== */
function updateUserInDB(updatedUser){
   const userIndex = accountsDB.findIndex(acc => acc.id === updatedUser.id)
   if(userIndex === -1) return false

   updatedUser.updatedAt = Date.now()
   accountsDB[userIndex] = updatedUser
   saveAccountsDB()
   return true
}

function updateCurrentUserProfile({ name, email }){
   const user = getCurrentUser()
   if(!user) return { ok: false, message: "No logged in user" }

   const cleanName = (name || "").trim()
   const cleanEmail = normalizeEmail(email || "")

   if(!cleanName){
      return { ok: false, message: "Name is required" }
   }

   if(cleanName.length < 2){
      return { ok: false, message: "Name is too short" }
   }

   if(!validateEmail(cleanEmail)){
      return { ok: false, message: "Invalid email address" }
   }

   const emailOwner = findUserByEmail(cleanEmail)
   if(emailOwner && emailOwner.id !== user.id){
      return { ok: false, message: "Email already in use" }
   }

   user.name = cleanName
   user.email = cleanEmail

   const saved = updateUserInDB(user)
   if(!saved){
      return { ok: false, message: "Failed to save profile" }
   }

   updateProfileUI()
   return { ok: true, message: "Profile updated successfully" }
}

function updateCurrentUserPassword({ currentPassword, newPassword, confirmPassword }){
   const user = getCurrentUser()
   if(!user) return { ok: false, message: "No logged in user" }

   if(!currentPassword){
      return { ok: false, message: "Enter current password" }
   }

   if(!verifyPassword(currentPassword, user.passwordHash)){
      return { ok: false, message: "Current password is incorrect" }
   }

   if(!validatePassword(newPassword)){
      return { ok: false, message: "New password must be at least 6 characters" }
   }

   if(newPassword !== confirmPassword){
      return { ok: false, message: "New passwords do not match" }
   }

   if(currentPassword === newPassword){
      return { ok: false, message: "New password must be different" }
   }

   user.passwordHash = hashPassword(newPassword)

   const saved = updateUserInDB(user)
   if(!saved){
      return { ok: false, message: "Failed to update password" }
   }

   return { ok: true, message: "Password updated successfully" }
}


/* ===============================
   ACCOUNT PAGE ACTION HANDLERS
=============================== */
function handleSaveProfileFromAccountPage(){
   const editNameInput = document.getElementById("editNameInput")
   const editEmailInput = document.getElementById("editEmailInput")

   if(!editNameInput || !editEmailInput){
      showToast("Profile form not found")
      return
   }

   const result = updateCurrentUserProfile({
      name: editNameInput.value,
      email: editEmailInput.value
   })

   showToast(result.message)

   if(result.ok){
      document.getElementById("editProfilePanel")?.classList.add("hidden")
      updateProfileUI()
      renderAccountPage()
   }
}

function handlePasswordChangeFromAccountPage(){
   const currentPasswordInput = document.getElementById("currentPasswordInput")
   const newPasswordInput = document.getElementById("newPasswordInput")
   const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput")

   if(!currentPasswordInput || !newPasswordInput || !confirmNewPasswordInput){
      showToast("Password form not found")
      return
   }

   const result = updateCurrentUserPassword({
      currentPassword: currentPasswordInput.value,
      newPassword: newPasswordInput.value,
      confirmPassword: confirmNewPasswordInput.value
   })

   showToast(result.message)

   if(result.ok){
      currentPasswordInput.value = ""
      newPasswordInput.value = ""
      confirmNewPasswordInput.value = ""

      document.getElementById("changePasswordPanel")?.classList.add("hidden")
      renderAccountPage()
   }
}


/* ===============================
   PROFILE IMAGE UPDATE
=============================== */
function handleAccountProfileImageUpload(e){
   const file = e.target.files?.[0]
   if(!file) return

   if(!file.type.startsWith("image/")){
      showToast("Only image files allowed")
      return
   }

   const user = getCurrentUser()

   if(!user){
      showToast("Create or login to save profile photo")
      return
   }

   const reader = new FileReader()
   reader.onload = function(){
      user.avatar = reader.result

      const userIndex = accountsDB.findIndex(acc => acc.id === user.id)
      if(userIndex !== -1){
         accountsDB[userIndex] = user
         saveAccountsDB()
      }

      updateProfileUI()

      const accountProfileImage = document.getElementById("accountProfileImage")
      if(accountProfileImage){
         accountProfileImage.src = reader.result
      }

      showToast("Profile image updated")
   }
   reader.readAsDataURL(file)
}

/* ===============================
   AUTO INIT
=============================== */
initProfileSystem()

/* ===============================
   GLOBAL CLOSE HANDLERS EXTENSION
=============================== */
document.addEventListener("click", (e)=>{
   if(profileDropdown && !e.target.closest(".profile-wrapper")){
      profileDropdown.classList.remove("active")
   }
})