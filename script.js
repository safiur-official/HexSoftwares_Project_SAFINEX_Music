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
history: renderHistory
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
history: renderHistory
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
}



async function renderExplore(){

pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Explore</h2>
<div class="song-grid" id="exploreGrid"></div>
`

const grid = document.getElementById("exploreGrid")

let loading = false

/* 🔥 INITIAL LOAD */
if(songs.length === 0){
const newSongs = await loadSongsFromAPI()

newSongs.forEach(song=>{
const index = songs.findIndex(s => s.id === song.id)
grid.appendChild(createSongCard(song,index))
})
}else{
songs.forEach((song,index)=>{
grid.appendChild(createSongCard(song,index))
})
}

/* 🔥 CONTINUOUS SCROLL LOADER */

let preloadBuffer = []
if(!exploreScrollInitialized){


const scrollContainer = document.querySelector(".main-content")

scrollContainer.addEventListener("scroll", async () => {

const scrollPosition = scrollContainer.scrollTop + scrollContainer.clientHeight
const threshold = scrollContainer.scrollHeight - 600

if(scrollPosition >= threshold && !loading && !exploreLoading){

loading = true
exploreLoading = true

/* skeleton */
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

/* fetch */
const newSongs = await loadSongsFromAPI()

if(!newSongs || newSongs.length === 0){
loading = false
return
}

/* remove skeleton */
const skeletons = grid.querySelectorAll(".song-card.skeleton")
skeletons.forEach(el=>el.classList.add("fade-out"))

setTimeout(()=>{
skeletons.forEach(el=>el.remove())
},300)

/* append */
newSongs.forEach(song=>{
const index = songs.findIndex(s => s.id === song.id)
grid.appendChild(createSongCard(song,index))
})

loading = false

}

})

exploreScrollInitialized = true
}
}

function renderLibrary(){

if(songs.length === 0){
loadSongsFromAPI()
return
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


function renderLiked(){
if(songs.length === 0){
loadSongsFromAPI()
return
}
pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Liked Songs</h2>
<div class="song-grid" id="likedGrid"></div>
`

refreshLikedPage()

}



function renderHistory(){

if(songs.length === 0){
loadSongsFromAPI()
return
}


pageContent.innerHTML = `
<h2 style="margin-bottom:20px">Listening History</h2>
<div class="song-grid" id="historyGrid"></div>
`

const grid = document.getElementById("historyGrid")

const history = JSON.parse(localStorage.getItem("history")) || []

history.forEach(index=>{
grid.appendChild(createSongCard(songs[index],index))
})

}





/* ===============================
UI ELEMENTS
=============================== */
const pageContent = document.getElementById("pageContent")
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
cover:track.album_image,
src:track.audio,
mood:detectCategory(Array.isArray(track.tags)?track.tags:[]),
tags:Array.isArray(track.tags)?track.tags:[]
}))

songs = [...songs, ...newSongs]

return newSongs

}catch(err){
console.error("API ERROR:", err)
return []
}finally{
isLoading = false
}
}

/* ===============================
section-specific loaders
=============================== */
async function loadHomeSections(){
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
cover: track.album_image,
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

listenData.forEach(song => {
const index = songs.findIndex(s => s.id === song.id)
if(index !== -1){
listenRow.appendChild(createSongCard(songs[index], index))
}
})
}

function renderTrendingRow(){
if(!trendingRow) return

if(trendingPage === 1){
trendingRow.innerHTML = ""
}

trendingData.forEach(song => {
let index = songs.findIndex(s => s.id === song.id)

if(index === -1){
songs.push(song)
index = songs.length - 1
}

trendingRow.appendChild(createSongCard(songs[index], index))
})
}

function renderFavoriteRow(){
if(!favoriteRow) return
favoriteRow.innerHTML = ""

favoriteData.forEach(song => {
const index = songs.findIndex(s => s.id === song.id)
if(index !== -1){
favoriteRow.appendChild(createSongCard(songs[index], index))
}
})
}

/* ===============================
INFINITE SONG LOADER
=============================== */

const mainContent = document.querySelector(".main-content")

mainContent.addEventListener("scroll", () => {

const scrollPosition =
mainContent.scrollTop + mainContent.clientHeight

const threshold =
mainContent.scrollHeight - 200

if(scrollPosition >= threshold){

loadSongsFromAPI()

}

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

/* ===============================
CREATE SONG CARD
=============================== */

function createSongCard(song,index){

const card = document.createElement("div")
card.className="song-card"

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
<img src="${song.cover}">
<div class="play-overlay">▶</div>
</div>

<h4>${song.title}</h4>
<p>${song.artist}</p>

`




/* play song */
card.onclick = () => {

currentSong = index

queue = songs
.map((_,i)=>i)
.filter(i=>i !== index)

loadSong(index)
audio.play()

}

/* menu toggle */

const menuBtn = card.querySelector(".song-menu-btn")
const menu = card.querySelector(".song-menu")

menuBtn.onclick = (e)=>{
e.stopPropagation()

/* 🔥 CLOSE ALL OTHER MENUS */
document.querySelectorAll(".song-menu.active")
.forEach(m => m.classList.remove("active"))

/* 🔥 OPEN CURRENT */
menu.classList.add("active")
}



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

const song = songs[index]

audio.src = song.src

/* RESUME SAVED PROGRESS */

const progressMemory =
JSON.parse(localStorage.getItem("songProgress")) || {}

if(progressMemory[song.id]){

audio.currentTime = progressMemory[song.id]

}

/* update like button state */

if(likedSongs.includes(song.id)){
likeBtn.classList.add("active")
}else{
likeBtn.classList.remove("active")
}

playBtn.innerHTML =
'<i class="fa-solid fa-pause"></i>'

songName.textContent = song.title

artistName.textContent = song.artist

playerCover.src = song.cover

bgBlur.style.backgroundImage=`url(${song.cover})`

musicPlayer.classList.add("active")
document.querySelector(".main-content").style.paddingBottom = "110px"

localStorage.setItem("recentSong",JSON.stringify(song))

let history =
JSON.parse(localStorage.getItem("history")) || []

if(!history.includes(index)){
history.unshift(index)
}

localStorage.setItem("history",JSON.stringify(history))

/* update queue panel */
renderQueue()

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

audio.play()

playBtn.innerHTML =
'<i class="fa-solid fa-pause"></i>'

}else{

audio.pause()

playBtn.innerHTML =
'<i class="fa-solid fa-play"></i>'

}

}

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
audio.play()

}

/* ===============================
NEXT SONG LOGIC
=============================== */

function playNext(){

/* 🔁 REPEAT ONE */
if(repeatMode === 2){
loadSong(currentSong)
audio.play()
return
}

/* 🔀 SHUFFLE MODE */
if(isShuffle){
currentSong = Math.floor(Math.random() * songs.length)
loadSong(currentSong)
audio.play()
return
}

/* ▶ NORMAL FLOW */
currentSong++

if(currentSong >= songs.length){

if(repeatMode === 1){
currentSong = 0   // loop playlist
}else{
return            // stop playback
}

}

loadSong(currentSong)
audio.play()

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

const likeBtn = document.getElementById("likeSongBtn")

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

listenRow.innerHTML = ""
trendingRow.innerHTML = ""
favoriteRow.innerHTML = ""

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
if(!recent) return

const heroImage = document.getElementById("heroImage")
const heroTitle = document.getElementById("heroTitle")
const heroArtist = document.getElementById("heroArtist")
const heroPlay = document.getElementById("heroPlay")

/* Update hero UI */

heroImage.src = recent.cover
heroTitle.textContent = recent.title
heroArtist.textContent = recent.artist

/* Hero background blur */

if(bgBlur){
bgBlur.style.backgroundImage = `url(${recent.cover})`
}

/* Play button */

if(heroPlay){
heroPlay.onclick = () => {

const index = songs.findIndex(song => song.id === recent.id)

if(index !== -1){

currentSong = index

loadSong(index)

/* resume progress */

const progressMemory =
JSON.parse(localStorage.getItem("songProgress")) || {}

if(progressMemory[recent.id]){
audio.currentTime = progressMemory[recent.id]
}

audio.play()

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
const queueBtn = document.getElementById("queueBtn")
const closeQueue = document.getElementById("closeQueue")


queueBtn.onclick = (e) => {
e.stopPropagation()   // 🔥 VERY IMPORTANT
document.querySelectorAll(".song-menu.active")
.forEach(m => m.classList.remove("active"))
queuePanel.classList.toggle("active")
}

queuePanel.onclick = (e)=>{
e.stopPropagation()   // 🔥 prevent closing when clicking inside
}

closeQueue.onclick = () => {
queuePanel.classList.remove("active")
}


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

listenData = chipCache[mood].listen
trendingData = chipCache[mood].trending
favoriteData = chipCache[mood].favorite

removeSkeletonSmooth()

listenRow.innerHTML = ""
trendingRow.innerHTML = ""
favoriteRow.innerHTML = ""

setTimeout(()=>{
renderListenRow()
renderTrendingRow()
renderFavoriteRow()
},50)

return
}

/* ===============================
FETCH FROM API
=============================== */

try{

const tags = moodTags[mood]

const url =
`https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=36&tags=${tags}&audioformat=mp31`

const res = await fetch(url)
const data = await res.json()

const moodSongs = data.results.map(track => ({
	
id: track.id,
title: track.name,
artist: track.artist_name,
cover: track.album_image,
src: track.audio,
mood: mood,
tags: Array.isArray(track.tags) ? track.tags : []
}))
songs = [...songs, ...moodSongs]

/* ===============================
FIX: ENSURE FULL 3 SECTIONS LOAD
=============================== */

/* take available mood songs */
listenData = moodSongs.slice(0, 12)
trendingData = moodSongs.slice(12, 24)
favoriteData = moodSongs.slice(24, 36)

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

listenRow.innerHTML = ""
trendingRow.innerHTML = ""
favoriteRow.innerHTML = ""

setTimeout(()=>{
renderListenRow()
renderTrendingRow()
renderFavoriteRow()
},50)

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
		const recent = JSON.parse(localStorage.getItem("recentSong"))

		if (!recent) return

		const index = songs.findIndex(s => s.id === recent.id)

		if (index !== -1) {
			currentSong = index
			loadSong(index)
			audio.play()
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

list.forEach(track=>{

const song = {
id:track.id,
title:track.name,
artist:track.artist_name,
cover:track.album_image,
src:track.audio
}

/* add to global songs */
songs.push(song)

const index = songs.length - 1

grid.appendChild(createSongCard(song, index))

})
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
document.addEventListener("click", () => {

if(searchResults){
searchResults.classList.remove("active")
}
/* 🔥 CLOSE ALL SONG MENUS */
document.querySelectorAll(".song-menu.active")
.forEach(menu => {
menu.classList.remove("active")
})

/* 🔥 CLOSE QUEUE PANEL */
const queuePanel = document.getElementById("queuePanel")
if(queuePanel){
queuePanel.classList.remove("active")
}

})


