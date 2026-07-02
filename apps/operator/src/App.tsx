import { useState } from 'react'
import { Machine, ItemMaster } from './api.ts'
import MachineScreen from './screens/MachineScreen.tsx'
import ItemMasterScreen from './screens/ItemMasterScreen.tsx'
import TrackingScreen from './screens/TrackingScreen.tsx'

type Screen = 'machine' | 'item-master' | 'tracking'

export default function App() {
  const [screen, setScreen] = useState<Screen>('machine')
  const [machine, setMachine] = useState<Machine | null>(null)
  const [itemMaster, setItemMaster] = useState<ItemMaster | null>(null)

  const handleMachineConfirmed = (m: Machine) => {
    setMachine(m)
    setScreen('item-master')
  }

  const handleItemMasterConfirmed = (im: ItemMaster) => {
    setItemMaster(im)
    setScreen('tracking')
  }

  const handleNewPart = () => {
    setItemMaster(null)
    setScreen('item-master')
  }

  const handleNewMachine = () => {
    setMachine(null)
    setItemMaster(null)
    setScreen('machine')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {screen === 'machine' && (
        <MachineScreen onConfirmed={handleMachineConfirmed} />
      )}
      {screen === 'item-master' && machine && (
        <ItemMasterScreen
          machine={machine}
          onConfirmed={handleItemMasterConfirmed}
          onChangeMachine={handleNewMachine}
        />
      )}
      {screen === 'tracking' && machine && itemMaster && (
        <TrackingScreen
          machine={machine}
          itemMaster={itemMaster}
          onNewPart={handleNewPart}
          onChangeMachine={handleNewMachine}
        />
      )}
    </div>
  )
}
