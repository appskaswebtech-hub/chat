self.addEventListener("push", function (event) {
    const data = event.data ? event.data.json() : {};
    event.waitUntil(
        self.registration.showNotification(data.title || "New Message", {
            body: data.body || "You have a new message",
            icon: "/favicon.ico",
            badge: "/favicon.ico",
            data: data,
        })
    );
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url || "/")
    );
});