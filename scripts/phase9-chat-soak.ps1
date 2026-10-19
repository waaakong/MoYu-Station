param(
  [Parameter(Mandatory = $true)]
  [string]$WebSocketUrl,
  [string]$SessionCookie = $env:STUDYROOM_SOAK_SESSION_COOKIE,
  [ValidateRange(1, 100)]
  [int]$Connections = 50,
  [ValidateRange(10, 86400)]
  [int]$DurationSeconds = 3600
)

$ErrorActionPreference = "Stop"

$uri = [Uri]$WebSocketUrl
if ($uri.Scheme -notin @("ws", "wss")) {
  throw "WebSocketUrl must use ws:// or wss://."
}
if ([string]::IsNullOrWhiteSpace($SessionCookie)) {
  throw "Set STUDYROOM_SOAK_SESSION_COOKIE or pass -SessionCookie. The value is never printed."
}

$clients = [System.Collections.Generic.List[object]]::new()
$failures = [System.Collections.Generic.List[string]]::new()
$startedAt = [DateTimeOffset]::UtcNow

function Start-Receive([System.Net.WebSockets.ClientWebSocket]$Socket) {
  $buffer = [byte[]]::new(65536)
  $segment = [ArraySegment[byte]]::new($buffer)
  return @{
    Buffer = $buffer
    Task = $Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None)
  }
}

try {
  for ($index = 0; $index -lt $Connections; $index += 1) {
    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $socket.Options.SetRequestHeader("Cookie", $SessionCookie)
    $socket.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(20)
    $socket.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $clients.Add(@{
      Index = $index
      Socket = $socket
      Receive = Start-Receive $socket
      Messages = 0
      LastPongAt = [DateTimeOffset]::UtcNow
    })
  }

  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($DurationSeconds)
  $nextPing = [DateTimeOffset]::UtcNow
  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    foreach ($client in $clients) {
      $socket = $client.Socket
      if ($socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
        $failures.Add("connection-$($client.Index)-state-$($socket.State)")
        continue
      }
      $receiveTask = $client.Receive.Task
      if ($receiveTask.IsCompleted) {
        try {
          $result = $receiveTask.GetAwaiter().GetResult()
          if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            $failures.Add("connection-$($client.Index)-server-close")
          } else {
            $client.Messages += 1
            $client.LastPongAt = [DateTimeOffset]::UtcNow
            $client.Receive = Start-Receive $socket
          }
        } catch {
          $failures.Add("connection-$($client.Index)-receive-error")
        }
      }
    }

    if ([DateTimeOffset]::UtcNow -ge $nextPing) {
      $payload = [Text.Encoding]::UTF8.GetBytes('{"type":"PING","payload":{}}')
      $segment = [ArraySegment[byte]]::new($payload)
      foreach ($client in $clients) {
        if ($client.Socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
          try {
            $client.Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
          } catch {
            $failures.Add("connection-$($client.Index)-send-error")
          }
        }
      }
      $nextPing = [DateTimeOffset]::UtcNow.AddSeconds(25)
    }
    Start-Sleep -Milliseconds 200
  }
} finally {
  foreach ($client in $clients) {
    try {
      if ($client.Socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $client.Socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "soak-complete", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      }
      $client.Socket.Dispose()
    } catch {
      $failures.Add("connection-$($client.Index)-cleanup-error")
    }
  }
}

$summary = [ordered]@{
  startedAt = $startedAt.ToString("O")
  completedAt = [DateTimeOffset]::UtcNow.ToString("O")
  targetConnections = $Connections
  durationSeconds = $DurationSeconds
  connected = $clients.Count
  receivedMessages = ($clients | Measure-Object -Property Messages -Sum).Sum
  failureCount = $failures.Count
  failures = @($failures | Select-Object -Unique | Select-Object -First 20)
}
$summary | ConvertTo-Json -Depth 4
if ($failures.Count -gt 0 -or $clients.Count -ne $Connections) { exit 1 }
