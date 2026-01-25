# OnePlus Nord CE 3 Lite GPS Optimization Guide

## Overview
OnePlus devices running OxygenOS 14 have aggressive battery optimization that can kill background services and interrupt GPS tracking. This guide covers device-specific settings to ensure reliable GPS accuracy during race sessions.

---

## Required Device Settings

### 1. Disable Battery Optimization for the App

**Method 1: Via App Info**
1. Long-press the Vera Team app icon → **App info**
2. Tap **Battery** or **Battery usage**
3. Select **Unrestricted** (not "Optimized" or "Restricted")

**Method 2: Via Settings**
1. Go to **Settings → Battery → Battery optimization**
2. Tap the dropdown and select **All apps**
3. Find **Vera Team Driver Display**
4. Select **Don't optimize**

### 2. Lock the App in Recent Apps

1. Open the app, then go to the Recent Apps screen (swipe up and hold)
2. Tap the app icon at the top of the app card
3. Select **Lock** (or tap the lock icon)
4. This prevents OxygenOS from killing the app when clearing memory

### 3. Enable Auto-launch

1. Go to **Settings → Apps → App management**
2. Find **Vera Team Driver Display**
3. Tap **Auto-launch** and enable it
4. This allows the app to start services in the background

### 4. Disable OxygenOS Battery Saver During Races

1. Go to **Settings → Battery → Battery Saver**
2. Turn **OFF** before starting a race session
3. Battery Saver aggressively throttles GPS updates

### 5. Configure Location Settings

1. Go to **Settings → Location**
2. Ensure **Location** is **ON**
3. Tap **Location services** → **Google Location Accuracy**
4. Enable **Improve Location Accuracy** (uses Wi-Fi/cell for faster GPS lock)

### 6. Disable Adaptive Battery

1. Go to **Settings → Battery → Adaptive Battery**
2. Turn **OFF**
3. This prevents the system from learning to kill the app

---

## OxygenOS 14 Specific Settings

### Deep Optimization (if available)
1. Go to **Settings → Battery → More battery settings**
2. Disable **Sleep standby optimization**
3. Disable **Optimize battery usage when sleeping**

### App Battery Management
1. Go to **Settings → Apps → Vera Team**
2. **Battery** → **Allow background activity** ✓
3. **Battery** → **Allow auto-launch** ✓
4. Disable **Pause app activity if unused**

---

## GPS Hardware Tips for Nord CE 3 Lite

### Improve GPS Signal Quality
1. **Clear sky view**: GPS works best outdoors with clear view of sky
2. **Avoid metal enclosures**: Don't place phone inside metal dashboard mounts
3. **Phone orientation**: Keep phone with screen facing up for best antenna reception
4. **Warm start**: Open the app 2-3 minutes before the race to get GPS lock

### GPS Modes
The app uses `PRIORITY_HIGH_ACCURACY` which enables:
- GPS satellites (most accurate)
- A-GPS (assisted GPS via network)
- Wi-Fi positioning (for faster first fix)
- Cell tower triangulation (backup)

---

## Recommended Race Day Workflow

1. **Before leaving pit**:
   - Open the app and wait for GPS accuracy < 5m
   - Verify "GPS Active" notification is visible
   - Check that map shows correct position

2. **During race**:
   - Keep app in foreground for best results
   - If using split-screen, keep Vera Team visible
   - The foreground service will continue tracking if you switch apps briefly

3. **If GPS stops working**:
   - Check notification area - service should show "GPS tracking active"
   - Open the app to restore foreground priority
   - Toggle airplane mode briefly to reset GPS

---

## Troubleshooting

### GPS Position Jumping/Jittering
- The app includes a Kalman filter to smooth this - give it 5-10 seconds to stabilize
- If persistent, check for obstructions (metal roof, tall buildings)
- Try moving to an area with better sky visibility

### No GPS Fix
1. Toggle **Location** off and on in quick settings
2. Check that Google Location Accuracy is enabled
3. Restart the app
4. As last resort, restart the phone

### App Killed in Background
1. Verify all battery optimization settings above
2. Lock the app in recent apps
3. Ensure foreground service notification is visible
4. The app uses WakeLock and foreground service to prevent this

### High Battery Usage
The high-accuracy GPS mode uses more battery. Expected usage:
- ~10-15% per hour during active tracking
- This is normal for 5Hz GPS updates
- Keep phone charged during longer sessions

---

## Technical Details

### Update Intervals
- **Moving**: 200ms (5 Hz) - optimal for racing
- **Stationary**: 1000ms (1 Hz) - saves battery when not moving
- **Fastest possible**: 100ms (10 Hz) - burst mode

### Accuracy Filtering
- Readings > 30m accuracy are rejected
- Kalman filter smooths position estimates
- Speed and bearing are also smoothed to reduce jitter

### Sensors Used
- GPS (primary position)
- Accelerometer (movement detection)
- Network location (backup/A-GPS)

---

## ADB Commands (Advanced)

For developers/advanced users, these ADB commands can help diagnose issues:

```bash
# Check GPS status
adb shell dumpsys location

# View location service logs
adb logcat -s LocationService

# Check battery optimization status
adb shell dumpsys deviceidle whitelist

# Add app to battery whitelist
adb shell dumpsys deviceidle whitelist +com.verateam.driverdisplay

# Monitor GPS updates in real-time
adb logcat | grep -E "(LocationService|GPS)"
```

---

## Summary Checklist

- [ ] Battery optimization: **Unrestricted**
- [ ] Auto-launch: **Enabled**
- [ ] App locked in recent apps: **Yes**
- [ ] Adaptive Battery: **Disabled**
- [ ] Battery Saver: **Off during races**
- [ ] Google Location Accuracy: **Enabled**
- [ ] GPS accuracy before race: **< 5 meters**
- [ ] Foreground notification: **Visible**
