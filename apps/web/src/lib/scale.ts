export interface ScaleReading {
  weight: number
  unit: string
  stable: boolean
  pluCode?: string
}

export interface ScaleProtocol {
  name: string
  parse(data: Uint8Array): ScaleReading | null
}

// Web Serial API type declarations (not yet in standard TS lib)
interface SerialPortOptions {
  baudRate: number
  dataBits?: 7 | 8
  parity?: "none" | "even" | "odd"
  stopBits?: 1 | 2
}

interface SerialPortInfo {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: SerialPortOptions): Promise<void>
  close(): Promise<void>
}

/**
 * CAS CL-3000 scale protocol implementation.
 * Parses weight data from the serial data stream.
 * Typical format: STX + data bytes + ETX
 * Weight is ASCII encoded between specific byte positions.
 */
export const casCl3000Protocol: ScaleProtocol = {
  name: "CAS CL-3000",
  parse(data: Uint8Array): ScaleReading | null {
    const text = new TextDecoder().decode(data)
    const weightMatch = text.match(/(\d+\.?\d*)\s*(kg|g|lb)/i)
    if (!weightMatch) return null

    let weight = Number.parseFloat(weightMatch[1])
    const unit = weightMatch[2].toLowerCase()

    // Normalize to KG
    if (unit === "g") weight /= 1000

    return {
      weight,
      unit: "kg",
      stable: !text.includes("M"), // M = motion/unstable
    }
  },
}

export const availableProtocols: ScaleProtocol[] = [casCl3000Protocol]

export class ScaleConnection {
  private port: SerialPortInfo | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private protocol: ScaleProtocol
  private onReading: ((reading: ScaleReading) => void) | null = null
  private running = false

  constructor(protocol: ScaleProtocol = casCl3000Protocol) {
    this.protocol = protocol
  }

  static isSupported(): boolean {
    return "serial" in navigator
  }

  async connect(options?: SerialPortOptions): Promise<void> {
    if (!ScaleConnection.isSupported()) {
      throw new Error("Web Serial API not supported")
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any
    this.port = await nav.serial.requestPort()
    await this.port!.open(
      options ?? {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      }
    )
    this.running = true
    this.startReading()
  }

  private async startReading(): Promise<void> {
    if (!this.port?.readable) return
    this.reader = this.port.readable.getReader()

    while (this.running) {
      try {
        const result = await this.reader.read()
        if (result.done) break
        if (result.value) {
          const reading = this.protocol.parse(result.value)
          if (reading && this.onReading) this.onReading(reading)
        }
      } catch {
        break
      }
    }
  }

  onWeight(callback: (reading: ScaleReading) => void): void {
    this.onReading = callback
  }

  async disconnect(): Promise<void> {
    this.running = false
    if (this.reader) {
      try {
        await this.reader.cancel()
      } catch {
        // Ignore cancellation errors
      }
    }
    if (this.port) {
      try {
        await this.port.close()
      } catch {
        // Ignore close errors
      }
    }
    this.port = null
    this.reader = null
  }

  setProtocol(protocol: ScaleProtocol): void {
    this.protocol = protocol
  }

  isConnected(): boolean {
    return this.port !== null && this.running
  }
}
