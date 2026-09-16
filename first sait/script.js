const photo = document.querySelector(".photo-link img");

photo.addEventListener("error", function () {
  photo.alt = "Добавьте файл photo.jpg в папку сайта";
});