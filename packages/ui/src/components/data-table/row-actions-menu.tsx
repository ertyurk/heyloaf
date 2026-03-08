import MoreVerticalIcon from "@hugeicons/core-free-icons/MoreVerticalIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import { Button } from "../button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../dropdown-menu"

interface RowActionsMenuProps {
  children: ReactNode
}

export function RowActionsMenu({ children }: RowActionsMenuProps) {
  if (!children) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <HugeiconsIcon icon={MoreVerticalIcon} size={16} />
          </Button>
        }
      />
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
