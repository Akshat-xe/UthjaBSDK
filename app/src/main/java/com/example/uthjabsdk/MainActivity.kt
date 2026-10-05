package com.example.uthjabsdk

import android.Manifest
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.example.uthjabsdk.core.design.ForestBg
import com.example.uthjabsdk.core.design.UthJaBSDKTheme
import com.example.uthjabsdk.core.reminders.ReminderIntegration
import com.example.uthjabsdk.core.reminders.ReminderScheduler
import com.example.uthjabsdk.core.sync.AndroidKeystoreSecretStorage
import com.example.uthjabsdk.core.sync.DefaultSnapshotHttpClient
import com.example.uthjabsdk.core.sync.PhoneActionStorage
import com.example.uthjabsdk.core.sync.SnapshotCache
import com.example.uthjabsdk.core.ui.RealUthJaBsdkDataSource
import com.example.uthjabsdk.navigation.AppNavHost
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var dataSource: RealUthJaBsdkDataSource
    private lateinit var reminderScheduler: ReminderScheduler
    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted && dataSource.alarmsEnabled.value) dataSource.toggleAlarms()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val credentialStorage = AndroidKeystoreSecretStorage(applicationContext)
        val snapshotCache = SnapshotCache(filesDir)
        val phoneActionStorage = PhoneActionStorage(filesDir)
        dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = DefaultSnapshotHttpClient()
        )
        reminderScheduler = ReminderIntegration.createScheduler(applicationContext)
        ReminderIntegration.bindToDataSource(this, dataSource, reminderScheduler)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                dataSource.alarmsEnabled.collect { enabled ->
                    if (enabled && !reminderScheduler.hasNotificationPermission()) {
                        notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            }
        }

        setContent {
            UthJaBSDKTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = ForestBg
                ) {
                    AppNavHost(dataSource = dataSource)
                }
            }
        }
    }
}
