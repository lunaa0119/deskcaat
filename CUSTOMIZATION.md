# deskcaat

以 [coglabss/deskcat](https://github.com/coglabss/deskcat) 為基礎修改的桌面像素貓。

## 目前修改

- 開心值低於 40 時持續跟隨滑鼠，靠近後停下；達到 40 恢復一般活動。
- 拖曳與摸摸、餵食等操作優先處理。
- Mac 全螢幕視窗與不同桌面的置頂顯示設定。
- 修正角色走路時的水平翻轉方向。
- 平穩活動時每次決策有 0.5% 機率喵叫，同一種聲音至少間隔 60 秒。
- 預設不啟用開機啟動。

保留走動、睡眠、餵食、摸摸、陪玩、拖曳、聲音與系統選單功能。
重新啟動會重設寵物數值。

## 啟動

需要 Node.js 與 npm。在專案資料夾內執行：

```sh
npm install
unzip -n bundled-assets/cat-art.zip -d assets/cats
unzip -n bundled-assets/cat-sounds.zip -d assets/sounds
npm start
```

Windows 可使用解壓縮工具將兩份 zip 分別解壓到 `assets/cats` 與 `assets/sounds`。

## 打包

```sh
npm run dist
```

產物位於 `dist/`，依執行環境產生 Mac `.app` 或 Windows 應用程式。
本次修改已在 Apple Silicon Mac 啟動，使用者確認跟隨滑鼠有效；Windows 尚未實測。
Mac 本機測試版本若有簽章問題，可對自己的打包產物進行本機簽章：

```sh
codesign --force --deep --sign - dist/DeskCat-darwin-arm64/DeskCat.app
```

## 驗證與授權

原有 36 項測試通過；不代表新增功能全部完成跨平台驗證。

```sh
npm test -- --runInBand --roots test
```

程式碼沿用 MIT 授權；圖片及聲音仍遵循原作者條款，詳見 `bundled-assets/CREDITS.txt`。
不包含 `node_modules`、本機應用程式或私人帳號設定。
