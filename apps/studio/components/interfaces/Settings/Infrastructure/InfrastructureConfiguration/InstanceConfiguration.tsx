import { useParams } from 'common'
import { partition } from 'lodash'
import { Globe2, Loader2, Network } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Edge, ReactFlowProvider, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconChevronDown,
} from 'ui'

import AlertError from 'components/ui/AlertError'
import { useLoadBalancersQuery } from 'data/read-replicas/load-balancers-query'
import { Database, useReadReplicasQuery } from 'data/read-replicas/replicas-query'
import { useReadReplicasStatusesQuery } from 'data/read-replicas/replicas-status-query'
import { AWS_REGIONS_KEYS } from 'lib/constants'
import { timeout } from 'lib/helpers'
import { useSubscriptionPageStateSnapshot } from 'state/subscription-page'
import ComputeInstanceSidePanel from '../../Addons/ComputeInstanceSidePanel'
import DeployNewReplicaPanel from './DeployNewReplicaPanel'
import DropReplicaConfirmationModal from './DropReplicaConfirmationModal'
import { addRegionNodes, generateNodes, getDagreGraphLayout } from './InstanceConfiguration.utils'
import { LoadBalancerNode, PrimaryNode, RegionNode, ReplicaNode } from './InstanceNode'
import MapView from './MapView'
import DropAllReplicasConfirmationModal from './DropAllReplicasConfirmationModal'

// [Joshen] Just FYI, UI assumes single provider for primary + replicas
// [Joshen] Idea to visualize grouping based on region: https://reactflow.dev/examples/layout/sub-flows
// [Joshen] Show flags for regions

const InstanceConfigurationUI = () => {
  const reactFlow = useReactFlow()
  const { resolvedTheme } = useTheme()
  const { ref: projectRef } = useParams()
  const numComingUp = useRef<number>()
  const snap = useSubscriptionPageStateSnapshot()

  const [view, setView] = useState<'flow' | 'map'>('flow')
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [showNewReplicaPanel, setShowNewReplicaPanel] = useState(false)
  const [refetchInterval, setRefetchInterval] = useState<number | boolean>(10000)
  const [newReplicaRegion, setNewReplicaRegion] = useState<AWS_REGIONS_KEYS>()
  const [selectedReplicaToDrop, setSelectedReplicaToDrop] = useState<Database>()
  const [selectedReplicaToRestart, setSelectedReplicaToRestart] = useState<Database>()

  const { data: loadBalancers, isSuccess: isSuccessLoadBalancers } = useLoadBalancersQuery({
    projectRef,
  })
  const {
    data,
    error,
    refetch,
    isLoading,
    isError,
    isSuccess: isSuccessReplicas,
  } = useReadReplicasQuery({
    projectRef,
  })
  const [[primary], replicas] = useMemo(
    () => partition(data ?? [], (db) => db.identifier === projectRef),
    [data, projectRef]
  )

  useReadReplicasStatusesQuery(
    { projectRef },
    {
      refetchInterval: refetchInterval as any,
      refetchOnWindowFocus: false,
      onSuccess: async (data) => {
        const comingUpReplicas = data.filter((db) => db.status === 'COMING_UP')
        const hasTransientStatus = comingUpReplicas.length > 0

        // If any replica's status has changed, refetch databases
        if (numComingUp.current !== comingUpReplicas.length) {
          numComingUp.current = comingUpReplicas.length
          await refetch()
        }

        // If all replicas are active healthy, stop fetching statuses
        if (!hasTransientStatus) {
          setRefetchInterval(false)
        }
      },
    }
  )

  const backgroundPatternColor =
    resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.4)'

  const nodes = useMemo(
    () =>
      isSuccessReplicas && isSuccessLoadBalancers
        ? generateNodes(primary, replicas, loadBalancers ?? [], {
            onSelectRestartReplica: setSelectedReplicaToRestart,
            onSelectDropReplica: setSelectedReplicaToDrop,
          })
        : [],
    [isSuccessReplicas, isSuccessLoadBalancers, primary, replicas, loadBalancers]
  )

  const edges: Edge[] = useMemo(
    () =>
      isSuccessReplicas && isSuccessLoadBalancers
        ? [
            ...((loadBalancers ?? []).length > 0
              ? [
                  {
                    id: `load-balancer-${primary.identifier}`,
                    source: 'load-balancer',
                    target: primary.identifier,
                    type: 'smoothstep',
                    animated: true,
                    className: '!cursor-default',
                  },
                ]
              : []),
            ...replicas.map((database) => {
              return {
                id: `${primary.identifier}-${database.identifier}`,
                source: primary.identifier,
                target: database.identifier,
                type: 'smoothstep',
                animated: true,
                className: '!cursor-default',
              }
            }),
          ]
        : [],
    [isSuccessLoadBalancers, isSuccessReplicas, loadBalancers, primary?.identifier, replicas]
  )

  const nodeTypes = useMemo(
    () => ({
      PRIMARY: PrimaryNode,
      READ_REPLICA: ReplicaNode,
      REGION: RegionNode,
      LOAD_BALANCER: LoadBalancerNode,
    }),
    []
  )

  const setReactFlow = async () => {
    const graph = getDagreGraphLayout(nodes, edges)
    const { nodes: updatedNodes } = addRegionNodes(graph.nodes, graph.edges)
    reactFlow.setNodes(updatedNodes)
    reactFlow.setEdges(graph.edges)

    // [Joshen] Odd fix to ensure that react flow snaps back to center when adding nodes
    await timeout(1)
    reactFlow.fitView({ maxZoom: 0.9, minZoom: 0.9 })
  }

  // [Joshen] Just FYI this block is oddly triggering whenever we refocus on the viewport
  // even if I change the dependency array to just data. Not blocker, just an area to optimize
  useEffect(() => {
    if (isSuccessReplicas && isSuccessLoadBalancers && nodes.length > 0 && view === 'flow')
      setReactFlow()
  }, [isSuccessReplicas, isSuccessLoadBalancers, nodes, edges, view])

  return (
    <>
      <div
        className={`h-[500px] w-full relative ${
          isSuccessReplicas ? '' : 'flex items-center justify-center px-28'
        }`}
      >
        {isLoading && <Loader2 className="animate-spin text-foreground-light" />}
        {isError && <AlertError error={error} subject="Failed to retrieve replicas" />}
        {isSuccessReplicas && (
          <>
            <div className="z-10 absolute top-4 right-4 flex items-center justify-center gap-x-2">
              <div className="flex items-center justify-center">
                <Button
                  type="default"
                  className="rounded-r-none"
                  onClick={() => setShowNewReplicaPanel(true)}
                >
                  Deploy a new replica
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="default"
                      icon={<IconChevronDown size={16} />}
                      className="px-1 rounded-l-none border-l-0"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 *:space-x-2">
                    <DropdownMenuItem onClick={() => snap.setPanelKey('computeInstance')}>
                      <div>Resize databases</div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowDeleteAllModal(true)}>
                      <div>Remove all replicas</div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center justify-center">
                <Button
                  type="default"
                  icon={<Network size={15} />}
                  className={`rounded-r-none transition ${
                    view === 'flow' ? 'opacity-100' : 'opacity-50'
                  }`}
                  onClick={() => setView('flow')}
                />
                <Button
                  type="default"
                  icon={<Globe2 size={15} />}
                  className={`rounded-l-none transition ${
                    view === 'map' ? 'opacity-100' : 'opacity-50'
                  }`}
                  onClick={() => setView('map')}
                />
              </div>
            </div>
            {view === 'flow' ? (
              <ReactFlow
                fitView
                fitViewOptions={{ minZoom: 0.9, maxZoom: 0.9 }}
                className="instance-configuration"
                zoomOnPinch={false}
                zoomOnScroll={false}
                nodesDraggable={false}
                nodesConnectable={false}
                zoomOnDoubleClick={false}
                edgesFocusable={false}
                edgesUpdatable={false}
                defaultNodes={[]}
                defaultEdges={[]}
                nodeTypes={nodeTypes}
                proOptions={{ hideAttribution: true }}
              >
                <Background color={backgroundPatternColor} />
              </ReactFlow>
            ) : (
              <MapView
                onSelectDeployNewReplica={(region) => {
                  setNewReplicaRegion(region)
                  setShowNewReplicaPanel(true)
                }}
                onSelectDropReplica={setSelectedReplicaToDrop}
              />
            )}
          </>
        )}
      </div>

      <DeployNewReplicaPanel
        visible={showNewReplicaPanel}
        selectedDefaultRegion={newReplicaRegion}
        onSuccess={() => setRefetchInterval(10000)}
        onClose={() => {
          setNewReplicaRegion(undefined)
          setShowNewReplicaPanel(false)
        }}
      />

      <DropReplicaConfirmationModal
        selectedReplica={selectedReplicaToDrop}
        onSuccess={() => setRefetchInterval(10000)}
        onCancel={() => setSelectedReplicaToDrop(undefined)}
      />

      <DropAllReplicasConfirmationModal
        visible={showDeleteAllModal}
        onSuccess={() => setRefetchInterval(10000)}
        onCancel={() => setShowDeleteAllModal(false)}
      />

      <ComputeInstanceSidePanel />

      {/* <ConfirmationModal
        size="medium"
        visible={selectedReplicaToRestart !== undefined}
        header="Confirm to restart selected replica?"
        buttonLabel="Restart replica"
        buttonLoadingLabel="Restarting replica"
        onSelectCancel={() => setSelectedReplicaToRestart(undefined)}
        onSelectConfirm={() => onConfirmRestartReplica()}
      >
        <Modal.Content className="py-3">
          <p className="text-sm">Before restarting the replica, consider:</p>
          <ul className="text-sm text-foreground-light py-1 list-disc mx-4 space-y-1">
            <li>
              Network traffic from this region may slow down while the replica is restarting,
              especially if you have no other replicas in this region
            </li>
          </ul>
          <p className="text-sm mt-2">
            Are you sure you want to restart this replica (ID: {selectedReplicaToRestart?.id}) now?{' '}
          </p>
        </Modal.Content>
      </ConfirmationModal> */}
    </>
  )
}

const InstanceConfiguration = () => {
  return (
    <ReactFlowProvider>
      <InstanceConfigurationUI />
    </ReactFlowProvider>
  )
}

export default InstanceConfiguration
