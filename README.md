# SD Fashion Billing System

Windows-এ চলার উপযোগী Electron + Express + SQLite ডেস্কটপ বিলিং সিস্টেম।

## Features
- Login system (JWT)
- Dashboard - আজকের বিক্রয়, বাকি, কম স্টক
- নতুন বিক্রয় - পণ্য নির্বাচন, ছাড়, বাকি হিসাব
- বিক্রয় ইতিহাস
- পণ্য ব্যবস্থাপনা (যোগ, সম্পাদনা, মুছুন)
- গ্রাহক ব্যবস্থাপনা

## Development

```bash
npm install
npm start          # Electron app চালু
npm run dev        # শুধু server চালু (browser-এ দেখতে)
```

## Build .exe

```bash
npm run dist       # dist/ ফোল্ডারে .exe তৈরি হবে
```

## Default Login

- Username: `admin`
- Password: `admin123`

## ফাইল Structure

```
SD-Fashion/
├── main.js                  # Electron entry point
├── package.json
├── server/
│   └── server.js            # Express + SQLite backend
├── public/
│   ├── index.html           # পুরো UI
│   └── preload.js           # Electron bridge
└── .github/workflows/
    └── build-windows.yml    # GitHub Actions
```
