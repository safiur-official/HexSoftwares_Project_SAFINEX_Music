/* ===============================
AUDIO PLAYER OBJECT
=============================== */
const audio = new Audio()

/* ===============================
AUDIO TAG MAPPING FOR MOOD FILTER
=============================== */
const moodTags = {
relax: "ambient,chill",
focus: "piano,instrumental",
party: "dance,edm",
coding: "lofi,chillhop,beats",
sleep: "meditation,calm"
}

const DEFAULT_COVER = "assets/default-cover.png"
/* ===============================
GLOBAL VARIABLES
=============================== */


let songs = []
let currentSong = 0
let queue = []

let likedSongs =
JSON.parse(localStorage.getItem("likedSongs")) || []

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

/* ===============================
SMART RECOMMENDATION ENGINE
=============================== */
let userProfile = {
   moods: {},
   artists: {},
   songs: {},
   recent: [],
   lastUpdated: Date.now()
}
const savedProfile = JSON.parse(localStorage.getItem("userProfile"))
if(savedProfile){
   userProfile = savedProfile
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

/* ===============================
APP ROUTER
=============================== */


function navigate(page){

if(page !== "explore"){
exploreScrollInitialized = false
}

const routes = {
home: renderHome,
explore: renderExplore,
library: renderLibrary,
liked: renderLiked,
history: renderHistory,
local: renderLocal
}

/* ✅ CLEAN HASH ROUTING */
history.pushState({}, "", "/#/" + page)

if(routes[page]){
routes[page]()
}

updateSidebarActive(page)

}

function navigateWithoutPush(page){

const routes = {
home: renderHome,
explore: renderExplore,
library: renderLibrary,
liked: renderLiked,
history: renderHistory,
local: renderLocal
}

if(routes[page]){
routes[page]()
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


/* ===============================
BROWSER BACK BUTTON SUPPORT
=============================== */

window.addEventListener("popstate", loadRouteFromURL)


/* ===============================
ROUTE RENDER FUNCTIONS
=============================== */



async function renderHome(){

pageContent.innerHTML = homeHTML

/* 🔥 RE-BIND DOM AFTER RENDER */
listenRow = document.getElementById("listenRow")
trendingRow = document.getElementById("trendingRow")
favoriteRow = document.getElementById("favoriteRow")

loadHeroSong()
initHomeInteractions()

/* 🔥 FIX */
if(songs.length === 0){
await loadSongsFromAPI()
}

await loadHomeSections()

preloadChips()
}



async function renderExplore(){

pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Explore</h2>
<div class="song-grid" id="exploreGrid"></div>
`

const grid = document.getElementById("exploreGrid")
const scrollContainer = document.querySelector(".main-content")

let loading = false

/* ===============================
🔥 INITIAL LOAD WITH SKELETON
=============================== */
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

/* ===============================
🔥 INFINITE SCROLL (FIXED)
=============================== */
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

            /* 🔥 SHOW SKELETON */
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

            /* 🔥 REMOVE SKELETON */
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

const history = JSON.parse(localStorage.getItem("history")) || []

history.forEach(id=>{
const index = songs.findIndex(s=>s.id===id)
if(index !== -1){
grid.appendChild(createSongCard(songs[index], index))
}
})

}





/* ===============================
UI ELEMENTS
=============================== */
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



/* ===============================
SIDEBAR ROUTER NAVIGATION
=============================== */

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



/* ===============================
JAMENDO API
=============================== */

const CLIENT_ID = "12748946"

let currentPage = 0
const LIMIT = 50      
const MAX_PAGES = 1000  // limit to prevent infinite loading in case of issues

let isLoading = false
let hasMore = true

/* ===============================
CATEGORY TAG MAP
=============================== */

const categoryMap = {

relax:["ambient","chill","downtempo","relaxing"],

focus:["instrumental","piano","study"],

party:["dance","house","edm"],

coding:["lofi","chillhop","beats"],

sleep:["sleep","meditation","calm"]

}

/* ===============================
DETECT CATEGORY
=============================== */

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

   if(songs.length === 0) return

   const pool = songs.filter((_,i)=> i !== currentSong)

   const sorted = smartSortSongs([...pool])

   queue = sorted
      .slice(0, 25)
      .map(song => songs.findIndex(s => s.id === song.id))

   renderQueue()
}


/* ===============================
LOAD SONGS FROM API
=============================== */

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

   console.log("🔥 Chips Preloaded")
}

/* ===============================
section-specific loaders
=============================== */
async function loadHomeSections(){

/* 🔥 ADD THIS — FIRST LINE INSIDE FUNCTION */
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

const history =
JSON.parse(localStorage.getItem("history")) || []

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

/* ===============================
row-specific render functions
=============================== */

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



/* ===============================
INFINITE SONG LOADER
=============================== */

const mainContent = document.querySelector(".main-content")

let scrollTimeout = null

mainContent.addEventListener("scroll", () => {

if(scrollTimeout) return   // 🔥 prevents spam

scrollTimeout = setTimeout(async () => {

const scrollPosition =
mainContent.scrollTop + mainContent.clientHeight

const threshold =
mainContent.scrollHeight - 200

if(scrollPosition >= threshold){

/* 🔥 EXTRA SAFETY */
if(!isLoading && hasMore){
await loadSongsFromAPI()
}

}

scrollTimeout = null

}, 200) // 🔥 throttle delay (tune: 150–300)

})


/* ===============================
SHOW SKELETON CARDS
=============================== */

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

/* ===============================
RENDER SONGS
=============================== */

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

/* ❌ invalid cases */
if(!cover || cover.trim() === "" || cover.includes("placeholder")){
return DEFAULT_COVER
}

/* ✅ valid */
return cover
}

/* ===============================
CREATE SONG CARD
=============================== */

function createSongCard(song,index){

const card = document.createElement("div")
card.className = "song-card"

/* 🔥 ADD THIS */
card.setAttribute("data-index", index)

card.innerHTML = `

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




/* play song */
card.addEventListener("click", (e) => {

/* 🔥 ignore menu clicks */
if(e.target.closest(".song-menu") || e.target.closest(".song-menu-btn")){
return
}

/* 🎯 SAME SONG CLICKED */
if(currentSong === index){

if(audio.paused){
audio.play().catch(()=>{})
}else{
audio.pause()
}

return
}

/* 🎯 NEW SONG */
currentSong = index

queue = songs
.map((_,i)=>i)
.filter(i=>i !== index)

loadSong(index)

audio.play().catch(()=>{})

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

queue.unshift(index)

showToast("Playing next")

renderQueue()

menu.classList.remove("active")
}

/* ADD TO QUEUE */

menu.querySelector(".add-queue").onclick = (e)=>{
e.stopPropagation()

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
localStorage.setItem("likedSongs",JSON.stringify(likedSongs))
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

return card

}

/* ===============================
Queue SYSTEM
=============================== */

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

/* ===============================
DRAG SORT QUEUE
=============================== */

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

/* ===============================
LOAD SONG
=============================== */

function loadSong(index){
if(!songs[index]) return

const song = songs[index]
/* 🔥 AI TRACKING START */
userProfile.songs[song.id] = (userProfile.songs[song.id] || 0) + 3

if(song.mood){
   userProfile.moods[song.mood] =
      (userProfile.moods[song.mood] || 0) + 2
}

userProfile.artists[song.artist] =
   (userProfile.artists[song.artist] || 0) + 2

userProfile.recent.unshift(song.id)
userProfile.recent = userProfile.recent.slice(0, 30)

localStorage.setItem("userProfile", JSON.stringify(userProfile))
/* 🔥 AI TRACKING END */


/* 🔥 SMART TRACKING FIX */
userProfile.recent.unshift(song.id)
userProfile.recent = userProfile.recent.slice(0, 20)

if(song.mood){
   userProfile.moods[song.mood] =
      (userProfile.moods[song.mood] || 0) + 1
}

userProfile.artists[song.artist] =
   (userProfile.artists[song.artist] || 0) + 1

audio.src = song.src

/* RESUME ONLY LAST PLAYED SONG */
const progressMemory =
JSON.parse(localStorage.getItem("songProgress")) || {}

const lastPlayedId = localStorage.getItem("lastPlayedId")

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

localStorage.setItem("recentSong", JSON.stringify({
...song,
cover: getValidCover(song.cover)


})
)



localStorage.setItem("lastPlayedId", song.id)

let history =
JSON.parse(localStorage.getItem("history")) || []

if(!history.includes(index)){
history.unshift(song.id)
}

localStorage.setItem("history",JSON.stringify(history))

/* update queue panel */
renderQueue()
updatePlayingUI()
generateSmartQueue()
}





/* ===============================
PLAY PAUSE
=============================== */
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

/* ===============================
NEXT / PREV
=============================== */

nextBtn.onclick=playNext

prevBtn.onclick = ()=>{

if(audio.currentTime > 5){
audio.currentTime = 0
return
}

if(isShuffle){
currentSong = Math.floor(Math.random() * songs.length)
}else{
currentSong--
if(currentSong < 0){
currentSong = songs.length - 1
}
}

loadSong(currentSong)
audio.play().then(()=>{
playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
}).catch(err=>{
console.warn("Play blocked:", err)
})

}

/* ===============================
NEXT SONG LOGIC
=============================== */

function playNext(){

/* 🔥 QUEUE FIRST */
if(queue.length > 0){
currentSong = queue.shift()
loadSong(currentSong)
audio.play()
return
}

/* 🔁 REPEAT ONE */
if(repeatMode === 2){
loadSong(currentSong)
audio.play()
return
}

/* 🔀 SHUFFLE */
if(isShuffle){
currentSong = Math.floor(Math.random() * songs.length)
loadSong(currentSong)
audio.play()
return
}

/* ▶ NORMAL */
currentSong++
if(currentSong >= songs.length){
if(repeatMode === 1){
currentSong = 0
}else{
return
}
}

loadSong(currentSong)
audio.play()
generateSmartQueue()
}

/* ===============================
PROGRESS BAR
=============================== */

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

let progressMemory =
JSON.parse(localStorage.getItem("songProgress")) || {}

progressMemory[currentSongObj.id] = audio.currentTime

localStorage.setItem(
"songProgress",
JSON.stringify(progressMemory)
)

}

})

/* ===============================
SEEK
=============================== */

progress.addEventListener("input",()=>{

audio.currentTime=(progress.value/100)*audio.duration

})

/* ===============================
VOLUME
=============================== */

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

/* ===============================
DURATION
=============================== */

audio.addEventListener("loadedmetadata",()=>{

durationEl.textContent=formatTime(audio.duration)

})

/* ===============================
SONG ENDED
=============================== */

audio.addEventListener("ended",()=>{

/* remove saved progress */

const song = songs[currentSong]

let progressMemory =
JSON.parse(localStorage.getItem("songProgress")) || {}

delete progressMemory[song.id]

localStorage.setItem(
"songProgress",
JSON.stringify(progressMemory)
)

playNext()

})

/* ===============================
FORMAT TIME
=============================== */

function formatTime(seconds){

if(isNaN(seconds)) return "0:00"

const mins=Math.floor(seconds/60)

const secs=Math.floor(seconds%60)

return mins+":"+(secs<10?"0"+secs:secs)

}

/* ===============================
SEARCH
=============================== */


const searchInput = document.getElementById("searchInput")

/* ===============================
DYNAMIC SEARCH PLACEHOLDER
=============================== */
const placeholderTexts = [
"Search songs...",
"Search artists...",
"Search albums..."
]

let placeholderIndex = 0
let placeholderInterval

function startPlaceholderLoop(){

placeholderInterval = setInterval(() => {

/* 🔥 STOP if user typing */
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

const searchResults=document.getElementById("searchResults")


const searchContent=document.querySelector(".search-content")





async function performSearch(query){

if(!query) return

if(!searchResults) return

searchResults.classList.add("active")
searchContent.innerHTML = "Searching..."

saveRecentSearch(query)

/* 🔥 PARALLEL SEARCH (FAST LIKE YT MUSIC) */
const [tracksRes, artistsRes, albumsRes] = await Promise.all([

fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=5&search=${encodeURIComponent(query)}`),

fetch(`https://api.jamendo.com/v3.0/artists/?client_id=${CLIENT_ID}&format=json&limit=3&search=${encodeURIComponent(query)}`),

fetch(`https://api.jamendo.com/v3.0/albums/?client_id=${CLIENT_ID}&format=json&limit=3&search=${encodeURIComponent(query)}`)

])

const tracksData = await tracksRes.json()
const artistsData = await artistsRes.json()
const albumsData = await albumsRes.json()

searchContent.innerHTML = ""

/* ===============================
🎵 SONGS SECTION
=============================== */
if(tracksData.results.length){

const title = document.createElement("h4")
title.innerText = "Songs"
searchContent.appendChild(title)

tracksData.results.forEach(item=>{
const div = document.createElement("div")
div.className = "search-item"

div.innerHTML = `
<img src="${item.album_image}">
<div>
<div>${item.name}</div>
<div style="font-size:12px;color:#aaa">${item.artist_name}</div>
</div>
`

/* 👉 CLICK → OPEN SEARCH PAGE */
div.onclick = ()=>{
navigateToSearchPage("songs", item.name)
}

searchContent.appendChild(div)
})
}

/* ===============================
👤 ARTISTS SECTION
=============================== */
if(artistsData.results.length){

const title = document.createElement("h4")
title.innerText = "Artists"
searchContent.appendChild(title)

artistsData.results.forEach(item=>{
const div = document.createElement("div")
div.className = "search-item"

div.innerHTML = `
<img src="${item.image || ""}">
<div>${item.name}</div>
`

div.onclick = ()=>{
navigateToSearchPage("artist", item.name)
}

searchContent.appendChild(div)
})
}

/* ===============================
💿 ALBUMS SECTION
=============================== */
if(albumsData.results.length){

const title = document.createElement("h4")
title.innerText = "Albums"
searchContent.appendChild(title)

albumsData.results.forEach(item=>{
const div = document.createElement("div")
div.className = "search-item"

div.innerHTML = `
<img src="${item.image || ""}">
<div>${item.name}</div>
`

div.onclick = ()=>{
navigateToSearchPage("album", item.id)
}

searchContent.appendChild(div)
})
}

}




/* ===============================
UPDATE LIKED PAGE
=============================== */

function updateLikedPage(){

const likedGrid = document.getElementById("likedGrid")

if(!likedGrid) return

likedGrid.innerHTML = ""

likedSongs.forEach(index => {

likedGrid.appendChild(createSongCard(songs[index], index))

})

}

/* ===============================
REFRESH LIKED PAGE
=============================== */

function refreshLikedPage(){

const likedGrid = document.getElementById("likedGrid")

if(!likedGrid) return

likedGrid.innerHTML = ""

likedSongs.forEach(index => {

likedGrid.appendChild(createSongCard(songs[index], index))

})

}

/* ===============================
LIKE SYSTEM
=============================== */


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

localStorage.setItem("likedSongs", JSON.stringify(likedSongs))

/* UPDATE LIKED PAGE IF OPEN */

updateLikedPage()
refreshLikedPage()

}

likeBtn.classList.add("animate")

setTimeout(()=>{
likeBtn.classList.remove("animate")
},300)




/* ===============================
RENDER FILTERED ROWS
=============================== */

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

/* ===============================
HERO RECENT SONG
=============================== */
function loadHeroSong(){

const recent = JSON.parse(localStorage.getItem("recentSong"))

const heroImage = document.getElementById("heroImage")
const heroTitle = document.getElementById("heroTitle")
const heroArtist = document.getElementById("heroArtist")
const heroPlay = document.getElementById("heroPlay")
const heroSection = document.querySelector(".hero-recommendation")

/* ===============================
🆕 NEW USER (NO HISTORY)
=============================== */
if(!recent){

const hour = new Date().getHours()

let greeting = "Welcome"
if(hour < 12) greeting = "Good Morning ☀️"
else if(hour < 17) greeting = "Good Afternoon 🌤️"
else greeting = "Good Evening 🌙"

/* 🔥 Replace Hero UI */
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

/* ===============================
🎵 EXISTING USER (NORMAL FLOW)
=============================== */

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
loadSong(index)
audio.play().then(()=>{
playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
}).catch(err=>{
console.warn("Play blocked:", err)
})
}
}
}

}

/* ===============================
LOAD ROUTE FROM URL
=============================== */

function loadRouteFromURL(){

let path = window.location.hash.replace("#/", "")

if(path === "") path = "home"

navigateWithoutPush(path)

}

/* ===============================
INITIAL ROUTE FIX (ADD HERE)
=============================== */
if(!window.location.hash){
history.replaceState({}, "", "/#/home")
}



/* ===============================
INITIALIZE PLAYER
=============================== */

loadRouteFromURL()

setTimeout(()=>{
loadSongsFromAPI()
},100)




/* ===============================
SIDEBAR OPEN / CLOSE
=============================== */

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



/* ===============================
REINITIALIZE HOME PAGE EVENTS
=============================== */

function initHomeInteractions(){

/* ===============================
CATEGORY FILTER
=============================== */

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


/* 🔥 SHOW SKELETON ONCE */
showSkeleton("listen")
showSkeleton("trending")
showSkeleton("favorite")

/* ===============================
ALL CATEGORY (FIXED 🔥)
=============================== */
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
/* ===============================
CACHE CHECK (NEW)
=============================== */

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

/* ===============================
FETCH FROM API
=============================== */

try{

let allResults = []

/* 🔥 USE PRELOADED DATA FIRST */
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

/* ===============================
FIX: ENSURE FULL 3 SECTIONS LOAD
=============================== */

/* take available mood songs */
/* 🔥 ENSURE MINIMUM DATA */
const baseList = smartSongs.length ? smartSongs : uniqueSongs

listenData = baseList.slice(0, 12)
trendingData = baseList.slice(12, 24)
favoriteData = baseList.slice(24, 36)

/* 🔥 STRONG FALLBACK (NO EMPTY UI) */
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


/* 🔥 FILL MISSING FROM GLOBAL SONGS */
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

/* 🔥 SAVE CACHE */
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

/* ===============================
ROW CONTROLS (VERY IMPORTANT)
=============================== */

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
const recentRaw = JSON.parse(localStorage.getItem("recentSong"))
const recent = recentRaw ? {
...recentRaw,
cover: getValidCover(recentRaw.cover)
} : null
		if (!recent) return

		const index = songs.findIndex(s => s.id === recent.id)

		if (index !== -1) {
			currentSong = index
			loadSong(index)
			audio.play().then(()=>{
playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
}).catch(err=>{
console.warn("Play blocked:", err)
})
		}
	}
}






let recentSearches =
JSON.parse(localStorage.getItem("recentSearches")) || []

function saveRecentSearch(query){

if(recentSearches.includes(query)) return

recentSearches.unshift(query)

recentSearches = recentSearches.slice(0,3)

localStorage.setItem(
"recentSearches",
JSON.stringify(recentSearches)
)

renderRecentSearches()

}

function renderRecentSearches(){

const list = document.getElementById("recentSearchList")
if(!list) return

list.innerHTML=""

/* 🔥 ADD LABEL */
if(recentSearches.length > 0){

const label = document.createElement("div")
label.className = "search-label"
label.innerText = "Recent Searches"

list.appendChild(label)
}

/* 🔥 ADD ITEMS */
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

/* ===============================
SEARCH RESULT PAGE (PREMIUM)
=============================== */
async function navigateToSearchPage(type, value){

history.pushState({}, "", "/#/search")

pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Search Results</h2>
<div class="song-grid" id="searchPageGrid"></div>
`

const grid = document.getElementById("searchPageGrid")

showSkeletonGrid(grid)

/* ===============================
🎵 SONG SEARCH
=============================== */
if(type === "songs"){
const res = await fetch(
`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=30&search=${encodeURIComponent(value)}`
)
const data = await res.json()

renderSearchGrid(data.results, grid)
}

/* ===============================
👤 ARTIST SEARCH
=============================== */
if(type === "artist"){
const res = await fetch(
`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=30&artist_name=${encodeURIComponent(value)}`
)
const data = await res.json()

renderSearchGrid(data.results, grid)
}

/* ===============================
💿 ALBUM SEARCH
=============================== */
if(type === "album"){
const res = await fetch(
`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=30&album_id=${value}`
)
const data = await res.json()

renderSearchGrid(data.results, grid)
}

/* close dropdown */
if(searchResults){
searchResults.classList.remove("active")
}

}



function renderSearchGrid(list, grid){

grid.innerHTML = ""

const fragment = document.createDocumentFragment()

list.forEach(track=>{

const song = {
id:track.id,
title:track.name,
artist:track.artist_name,
cover:track.album_image,
src:track.audio
}

/* prevent duplicate */
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


/* ===============================
GLOBAL CLICK HANDLER (FIX 6 FINAL)
=============================== */
document.addEventListener("click", (e) => {
if(!e.target.closest(".search-bar")){
if(searchResults){
searchResults.classList.remove("active")
}
}
/* 🔥 CLOSE ALL SONG MENUS */
document.querySelectorAll(".song-menu.active")
.forEach(menu => {
menu.classList.remove("active")
})

/* 🔥 CLOSE QUEUE PANEL */
const queuePanel = document.getElementById("queuePanel")
if(queuePanel && !queuePanel.contains(e.target)){
   queuePanel.classList.remove("active")
}

})


function renderLocal(){

pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Local Files</h2>

<!-- 🔥 ADD THIS INPUT -->
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

btn.onclick = () => fileInput.click()

/* ===============================
FILE INPUT
=============================== */
fileInput.onchange = (e)=>{

const files = Array.from(e.target.files)

/* 🔥 FILTER AUDIO ONLY */
const audioFiles = files.filter(f => f.type.startsWith("audio"))

if(audioFiles.length === 0){
showToast("Only audio files allowed 🎵")
return
}

handleFiles(audioFiles)

/* 🔥 RESET INPUT (VERY IMPORTANT) */
fileInput.value = ""

}

/* ===============================
DRAG & DROP
=============================== */
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
/* ===============================
LOAD FROM DB ON OPEN
=============================== */
loadLocalFromDB()

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
cover = DEFAULT_COVER   // 🔥 USE YOUR DESIGN
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

/* 🔥 ADD THIS */
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

const songData = {
id: "local_" + Date.now() + Math.random(),
title,
artist,
cover: cover || generatePremiumCover(title),

src: reader.result
}

const tx = db.transaction("songs", "readwrite")
const store = tx.objectStore("songs")
store.add(songData)

/* add to UI */
songs.push(songData)
updatePlayingUI()
const index = songs.length - 1

const grid = document.getElementById("localGrid")
if(grid){
grid.appendChild(createSongCard(songData, index))


}

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

request.result.forEach(song=>{


if(!songs.some(s => s.id === song.id)){
songs.push(song)
}
const index = songs.findIndex(s => s.id === song.id)
grid.appendChild(createSongCard(song, index))

})

}

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